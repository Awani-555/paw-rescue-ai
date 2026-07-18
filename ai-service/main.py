import base64
import io
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image
import numpy as np
import torch
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights

load_dotenv()

app = FastAPI()

# This service is only ever called server-to-server from the Node backend
# (see backend/server.js's axios.post to AI_SERVICE_URL) - never directly
# from a browser, so it needs no CORS policy at all, and it needs to not be
# reachable by anyone who isn't that backend. INTERNAL_SERVICE_TOKEN is a
# shared secret both sides are configured with; a request missing or
# mismatching it never reaches model inference.
INTERNAL_SERVICE_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN")

if not INTERNAL_SERVICE_TOKEN:
    raise RuntimeError(
        "INTERNAL_SERVICE_TOKEN environment variable is required so this service can't be "
        "called by anyone except the backend. Generate one with: "
        "python -c \"import secrets; print(secrets.token_hex(32))\" "
        "and set the same value as AI_SERVICE_TOKEN in the backend's .env."
    )


def require_internal_token(x_internal_token: str = Header(default="")):
    if x_internal_token != INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


# Generous but bounded: a 15MB image, base64-encoded, is roughly 20MB of
# text. This is this service's OWN boundary - it can't rely on the Node
# backend's size check as the only thing standing between it and an
# unbounded-memory decode, since auth (above) is the only thing that
# should be calling this at all, but defense in depth costs nothing here.
MAX_IMAGE_BASE64_CHARS = 21 * 1024 * 1024


class AnalyzeRequest(BaseModel):
    image: str = Field(min_length=1, max_length=MAX_IMAGE_BASE64_CHARS)

# Loaded once at startup. Weights download to the torch cache on first run
# (roughly 14MB) and are reused after that.
_weights = MobileNet_V2_Weights.IMAGENET1K_V2
_model = mobilenet_v2(weights=_weights)
_model.eval()
_preprocess = _weights.transforms()
_categories = _weights.meta["categories"]

# ImageNet has no single "dog"/"cat"/"bird" class: it has ~120 individual dog
# breeds, 5 domestic cat variants, and dozens of individual bird species.
# We bucket the model's top-5 predictions into the coarse categories this
# app cares about by matching against the breed/species names ImageNet uses.
DOG_KEYWORDS = [
    "terrier", "retriever", "spaniel", "hound", "pointer", "setter",
    "sheepdog", "collie", "shepherd", "schnauzer", "poodle", "mastiff",
    "bulldog", "pinscher", "husky", "malamute", "chihuahua", "pug",
    "beagle", "dachshund", "rottweiler", "doberman", "boxer", "papillon",
    "pomeranian", "chow", "akita", "basenji", "whippet", "greyhound",
    "dalmatian", "labrador", "pembroke", "cardigan", "samoyed",
    "newfoundland", "leonberg", "keeshond", "griffon", "maltese",
    "shih-tzu", "pekinese", "lhasa", "kuvasz", "schipperke", "malinois",
    "briard", "kelpie", "komondor", "bouvier", "vizsla", "ridgeback",
    "borzoi", "saluki", "deerhound", "elkhound", "otterhound",
    "eskimo dog", "dingo", "dhole", "affenpinscher", "basset",
    "bloodhound", "bluetick", "coonhound", "foxhound", "redbone",
    "wolfhound", "ibizan", "staffordshire", "bedlington", "airedale",
    "cairn", "dandie dinmont", "boston bull", "wheaten terrier",
    "west highland", "tibetan terrier", "tibetan mastiff", "clumber",
    "springer", "sussex spaniel", "entlebucher", "appenzeller",
    "bernese", "great pyrenees", "great dane",
]
CAT_KEYWORDS = ["tabby", "tiger cat", "persian cat", "siamese cat", "egyptian cat"]
BIRD_KEYWORDS = [
    "cock", "hen", "ostrich", "brambling", "goldfinch", "house finch",
    "junco", "indigo bunting", "robin", "bulbul", "jay", "magpie",
    "chickadee", "water ouzel", "kite", "bald eagle", "vulture",
    "grey owl", "stork", "spoonbill", "flamingo", "heron", "egret",
    "bittern", "crane", "limpkin", "gallinule", "coot", "bustard",
    "turnstone", "sandpiper", "redshank", "dowitcher", "oystercatcher",
    "pelican", "penguin", "albatross", "peacock", "quail", "partridge",
    "macaw", "cockatoo", "lorikeet", "coucal", "bee eater", "hornbill",
    "hummingbird", "jacamar", "toucan", "drake", "merganser", "goose",
    "swan", "parrot", "finch", "sparrow",
]


def classify_species(img):
    """Real inference: run the image through a pretrained MobileNetV2 and map
    its top-5 ImageNet predictions onto Dog / Cat / Bird / Unknown."""
    tensor = _preprocess(img).unsqueeze(0)
    with torch.no_grad():
        logits = _model(tensor)
        probs = torch.nn.functional.softmax(logits[0], dim=0)
    top5_probs, top5_idx = torch.topk(probs, 5)

    for prob, idx in zip(top5_probs.tolist(), top5_idx.tolist()):
        label = _categories[idx].lower()
        if any(k in label for k in DOG_KEYWORDS):
            return "Dog", round(prob, 2), _categories[idx]
        if any(k in label for k in CAT_KEYWORDS):
            return "Cat", round(prob, 2), _categories[idx]
        if any(k in label for k in BIRD_KEYWORDS):
            return "Bird", round(prob, 2), _categories[idx]

    top1_label = _categories[top5_idx[0].item()]
    return "Unknown", round(top5_probs[0].item(), 2), top1_label


def estimate_severity(img_array):
    """No pretrained model exists for injury severity - this is a pixel-contrast
    heuristic, not wound/blood/posture detection, and has no real correlation
    with how badly hurt the animal is. It exists only to pick a starting badge
    for the reporter to confirm or override (see the severity override UI),
    never as a standalone diagnosis.

    Thresholds are deliberately biased toward over-triaging: a false "Mild" on
    a genuinely critical animal is the dangerous failure mode for a rescue
    app (someone doesn't call for urgent help), while a false "Critical" on a
    mild case just costs a moment of the reporter re-checking. So this leans
    toward Urgent/Critical whenever the signal is ambiguous rather than
    defaulting to the calmest label.
    """
    darkness = np.mean(np.max(img_array, axis=2) - np.min(img_array, axis=2))

    if darkness > 80:
        return "Critical", ["Possible visible trauma - inspect closely and treat as an emergency if unsure"]
    if darkness > 40:
        return "Urgent", ["Possible moderate injury - inspect closely and seek veterinary advice"]
    return "Mild", ["No obvious severe trauma detected from the photo alone - inspect closely anyway"]


def first_aid_for(severity):
    if severity == "Critical":
        return [
            "Call emergency veterinary service immediately",
            "Do not move the animal unless it is in immediate danger",
            "Keep the animal calm and warm",
            "Monitor breathing and consciousness",
            "Avoid feeding or giving water",
        ]
    if severity == "Urgent":
        return [
            "Contact a veterinarian as soon as possible",
            "Gently place the animal in a safe, warm location",
            "Provide water if the animal is conscious",
            "Cover any visible wounds with a clean cloth",
            "Minimize handling to reduce stress",
        ]
    return [
        "Keep the animal in a safe, comfortable location",
        "Offer water and food if appropriate",
        "Monitor for any signs of distress",
        "Schedule a veterinary check-up",
        "Take photos for record-keeping",
    ]


def analyze_animal(image_data):
    try:
        if isinstance(image_data, str):
            image_bytes = base64.b64decode(image_data)
        else:
            image_bytes = image_data
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)

        species, confidence, raw_label = classify_species(img)
        severity, injuries = estimate_severity(img_array)

        return {
            "species": species,
            "severity": severity,
            "injuries": injuries,
            "confidence": confidence,
            "first_aid": first_aid_for(severity),
            "detected_label": raw_label,
            "severity_note": (
                "This severity is a rough visual estimate, not a medical assessment - it "
                "cannot see wounds, bleeding, or pain. Please confirm or correct it yourself "
                "below, and when in doubt, treat it as more urgent than shown."
            ),
        }

    except Exception as e:  # pylint: disable=broad-except
        # A failed read is an unknown, not a reassurance: defaulting the
        # unreadable case to "Mild" would be the exact false-negative this
        # service should never produce, so an assessment we couldn't
        # actually run leans toward "Urgent" instead.
        print(f"Error analyzing image: {e}")
        return {
            "species": "Unknown",
            "severity": "Urgent",
            "injuries": ["Unable to fully assess from this photo"],
            "confidence": 0.0,
            "first_aid": ["Consult a veterinarian for professional assessment"],
            "detected_label": None,
            "severity_note": "Automated analysis failed for this photo. Please assess the animal directly and treat it as urgent if unsure.",
        }


@app.post("/analyze", dependencies=[Depends(require_internal_token)])
async def analyze(request: AnalyzeRequest):
    """Analyze animal from a base64-encoded image.
    Expected JSON: { "image": "<base64_string>" }
    """
    try:
        return analyze_animal(request.image)
    except Exception as e:  # pylint: disable=broad-except
        # Never forward str(e) to the client - it can leak internal paths
        # or library internals. The real message is logged server-side.
        print(f"Error in /analyze: {e}")
        raise HTTPException(status_code=500, detail="Analysis failed. Please try again.") from e


@app.get("/health")
async def health():
    return {"status": "ok", "service": "paw-rescue-ai-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
