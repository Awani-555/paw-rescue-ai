from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import base64
import io
from PIL import Image
import numpy as np
import torch
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    """No pretrained model exists for injury severity, this is a rough
    heuristic based on pixel contrast, not a real assessment of wounds.
    Treat the result as a prompt to look closely, not a diagnosis."""
    darkness = np.mean(np.max(img_array, axis=2) - np.min(img_array, axis=2))

    if darkness > 100:
        return "Critical", ["Possible visible trauma, inspect closely"]
    if darkness > 60:
        return "Urgent", ["Possible moderate injury, inspect closely"]
    return "Mild", ["No obvious severe trauma detected, inspect closely anyway"]


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
            "severity_note": "Severity is an automated estimate based on image contrast, not a veterinary diagnosis. When in doubt, treat as urgent.",
        }

    except Exception as e:
        print(f"Error analyzing image: {e}")
        return {
            "species": "Unknown",
            "severity": "Mild",
            "injuries": ["Unable to fully assess"],
            "confidence": 0.0,
            "first_aid": ["Consult a veterinarian for professional assessment"],
            "detected_label": None,
            "severity_note": "Automated analysis failed. Please assess the animal directly.",
        }


@app.post("/analyze")
async def analyze(request: dict):
    """Analyze animal from a base64-encoded image.
    Expected JSON: { "image": "<base64_string>" }
    """
    try:
        if "image" not in request:
            raise HTTPException(status_code=400, detail="Missing 'image' field")

        return analyze_animal(request["image"])

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /analyze: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "paw-rescue-ai-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
