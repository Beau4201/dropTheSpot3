from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Union
import uuid
from datetime import datetime, timezone
import jwt
from passlib.context import CryptContext
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Security
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 1 week

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Spot Models
class SpotCreate(BaseModel):
    title: str
    description: str
    photo: str  # base64 encoded image
    latitude: float
    longitude: float

class Spot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    photo: str
    latitude: float
    longitude: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Helper functions for MongoDB serialization
def prepare_for_mongo(data):
    """Prepare data for MongoDB storage"""
    if isinstance(data, dict):
        if 'created_at' in data and isinstance(data['created_at'], datetime):
            data['created_at'] = data['created_at'].isoformat()
    return data

def parse_from_mongo(item):
    """Parse data from MongoDB"""
    if isinstance(item, dict):
        if 'created_at' in item and isinstance(item['created_at'], str):
            item['created_at'] = datetime.fromisoformat(item['created_at'])
        # Remove MongoDB's _id field
        item.pop('_id', None)
    return item

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Drop the Spot API"}

@api_router.post("/spots", response_model=Spot)
async def create_spot(spot_data: SpotCreate):
    """Create a new spot"""
    try:
        spot = Spot(**spot_data.dict())
        spot_dict = prepare_for_mongo(spot.dict())
        
        result = await db.spots.insert_one(spot_dict)
        if result.inserted_id:
            return spot
        else:
            raise HTTPException(status_code=500, detail="Failed to create spot")
    except Exception as e:
        logging.error(f"Error creating spot: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.get("/spots", response_model=List[Spot])
async def get_all_spots():
    """Get all spots"""
    try:
        spots_data = await db.spots.find().to_list(length=None)
        spots = []
        for spot_data in spots_data:
            parsed_spot = parse_from_mongo(spot_data)
            spots.append(Spot(**parsed_spot))
        return spots
    except Exception as e:
        logging.error(f"Error fetching spots: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.get("/spots/{spot_id}", response_model=Spot)
async def get_spot(spot_id: str):
    """Get a specific spot by ID"""
    try:
        spot_data = await db.spots.find_one({"id": spot_id})
        if not spot_data:
            raise HTTPException(status_code=404, detail="Spot not found")
        
        parsed_spot = parse_from_mongo(spot_data)
        return Spot(**parsed_spot)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching spot {spot_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.delete("/spots/{spot_id}")
async def delete_spot(spot_id: str):
    """Delete a spot"""
    try:
        result = await db.spots.delete_one({"id": spot_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Spot not found")
        return {"message": "Spot deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting spot {spot_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()