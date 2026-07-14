from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import base64
import io
from PIL import Image
import numpy as np
import json

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def analyze_animal_heuristic(image_data):
    """
    Deterministic heuristic-based animal analysis.
    Analyzes image properties to determine species, severity, and injuries.
    """
    try:
        # Open image
        if isinstance(image_data, str):
            # Base64 string
            image_bytes = base64.b64decode(image_data)
            img = Image.open(io.BytesIO(image_bytes))
        else:
            # Already bytes
            img = Image.open(io.BytesIO(image_data))

        img = img.convert('RGB')
        img_array = np.array(img)

        # Calculate basic statistics
        mean_color = np.mean(img_array, axis=(0, 1))
        pixel_variance = np.var(img_array)
        
        # Determine dominant color channel
        r_mean, g_mean, b_mean = mean_color[0], mean_color[1], mean_color[2]
        
        # Heuristic: Determine species based on color distribution
        species = "Unknown"
        confidence = 0.6
        
        # Dog heuristic: brownish/reddish tones
        if r_mean > g_mean and r_mean > b_mean and r_mean - b_mean > 20:
            species = "Dog"
            confidence = 0.75
        # Cat heuristic: gray/white/orange patterns
        elif (g_mean < 180 and r_mean < 180 and b_mean < 180):
            if abs(r_mean - g_mean) < 30:
                species = "Cat"
                confidence = 0.70
        # Bird heuristic: colorful patterns
        elif pixel_variance > 2000:
            species = "Bird"
            confidence = 0.65
        else:
            species = "Unknown"
            confidence = 0.5

        # Determine severity based on image darkness/contrast
        darkness = np.mean(np.max(img_array, axis=2) - np.min(img_array, axis=2))
        
        if darkness > 100:
            severity = "Critical"
            injuries = ["Visible trauma", "Potential internal injuries"]
        elif darkness > 60:
            severity = "Urgent"
            injuries = ["Moderate injuries", "Possible fractures"]
        else:
            severity = "Mild"
            injuries = ["Minor scratches", "Possible stress"]

        # Generate first aid recommendations
        first_aid = []
        if severity == "Critical":
            first_aid = [
                "Call emergency veterinary service immediately",
                "Do not move the animal unless in immediate danger",
                "Keep the animal calm and warm",
                "Monitor breathing and consciousness",
                "Avoid feeding or giving water",
            ]
        elif severity == "Urgent":
            first_aid = [
                "Contact a veterinarian as soon as possible",
                "Gently place animal in a safe, warm location",
                "Provide water if animal is conscious",
                "Cover any visible wounds with clean cloth",
                "Minimize handling to reduce stress",
            ]
        else:
            first_aid = [
                "Keep the animal in a safe, comfortable location",
                "Offer water and food if appropriate",
                "Monitor for any signs of distress",
                "Schedule a veterinary check-up",
                "Take photos for record-keeping",
            ]

        return {
            "species": species,
            "severity": severity,
            "injuries": injuries,
            "confidence": round(confidence, 2),
            "first_aid": first_aid,
        }

    except Exception as e:
        print(f"Error analyzing image: {e}")
        # Fallback response
        return {
            "species": "Unknown",
            "severity": "Mild",
            "injuries": ["Unable to fully assess"],
            "confidence": 0.4,
            "first_aid": ["Consult a veterinarian for professional assessment"],
        }

@app.post("/analyze")
async def analyze(request: dict):
    """
    Analyze animal from base64 image or uploaded file.
    Expected JSON: { "image": "<base64_string>" }
    """
    try:
        if "image" not in request:
            raise HTTPException(status_code=400, detail="Missing 'image' field")

        image_data = request["image"]
        result = analyze_animal_heuristic(image_data)
        
        return result

    except Exception as e:
        print(f"Error in /analyze: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "paw-rescue-ai-service"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)