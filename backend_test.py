#!/usr/bin/env python3
"""
Backend API Testing for Drop the Spot Platform
Tests all Spot CRUD endpoints with realistic data
"""

import requests
import json
import base64
import os
from datetime import datetime
import uuid

# Load environment variables
def get_backend_url():
    """Get backend URL from frontend .env file"""
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception as e:
        print(f"Error reading frontend .env: {e}")
        return None

# Configuration
BACKEND_URL = get_backend_url()
if not BACKEND_URL:
    print("ERROR: Could not get REACT_APP_BACKEND_URL from frontend/.env")
    exit(1)

API_BASE = f"{BACKEND_URL}/api"
print(f"Testing backend at: {API_BASE}")

# Sample base64 image (small 1x1 pixel PNG)
SAMPLE_IMAGE_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

# Test data - realistic spot data for a chill platform
TEST_SPOTS = [
    {
        "title": "Vondelpark Sunset Spot",
        "description": "Perfect spot to watch the sunset over the pond. Great for evening chills with friends. Bring a blanket!",
        "photo": SAMPLE_IMAGE_B64,
        "latitude": 52.3579946,
        "longitude": 4.8686945
    },
    {
        "title": "Rooftop Garden Hideaway",
        "description": "Hidden rooftop garden with amazing city views. Quiet spot for smoking and deep conversations.",
        "photo": SAMPLE_IMAGE_B64,
        "latitude": 52.3702157,
        "longitude": 4.8951679
    },
    {
        "title": "Canal Side Bench",
        "description": "Peaceful canal-side spot perfect for morning coffee or evening drinks. Watch the boats go by.",
        "photo": SAMPLE_IMAGE_B64,
        "latitude": 52.3676,
        "longitude": 4.9041
    }
]

class BackendTester:
    def __init__(self):
        self.created_spots = []
        self.test_results = {
            "api_health": False,
            "create_spot": False,
            "get_all_spots": False,
            "get_single_spot": False,
            "delete_spot": False,
            "errors": []
        }

    def log_error(self, test_name, error):
        """Log test errors"""
        error_msg = f"{test_name}: {error}"
        self.test_results["errors"].append(error_msg)
        print(f"❌ {error_msg}")

    def log_success(self, test_name, message=""):
        """Log test success"""
        print(f"✅ {test_name}: {message}")

    def test_api_health(self):
        """Test if API is accessible"""
        print("\n🔍 Testing API Health...")
        try:
            response = requests.get(f"{API_BASE}/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.test_results["api_health"] = True
                    self.log_success("API Health Check", f"Response: {data}")
                    return True
                else:
                    self.log_error("API Health Check", f"Unexpected response format: {data}")
            else:
                self.log_error("API Health Check", f"Status {response.status_code}: {response.text}")
        except requests.exceptions.RequestException as e:
            self.log_error("API Health Check", f"Connection error: {e}")
        except Exception as e:
            self.log_error("API Health Check", f"Unexpected error: {e}")
        return False

    def test_create_spot(self):
        """Test POST /api/spots endpoint"""
        print("\n🔍 Testing Create Spot (POST /api/spots)...")
        
        for i, spot_data in enumerate(TEST_SPOTS):
            try:
                response = requests.post(
                    f"{API_BASE}/spots",
                    json=spot_data,
                    headers={"Content-Type": "application/json"},
                    timeout=10
                )
                
                if response.status_code == 200:
                    created_spot = response.json()
                    
                    # Validate response structure
                    required_fields = ["id", "title", "description", "photo", "latitude", "longitude", "created_at"]
                    missing_fields = [field for field in required_fields if field not in created_spot]
                    
                    if missing_fields:
                        self.log_error(f"Create Spot {i+1}", f"Missing fields: {missing_fields}")
                        continue
                    
                    # Validate data types and values
                    if not isinstance(created_spot["id"], str) or len(created_spot["id"]) == 0:
                        self.log_error(f"Create Spot {i+1}", "Invalid ID format")
                        continue
                    
                    if created_spot["title"] != spot_data["title"]:
                        self.log_error(f"Create Spot {i+1}", f"Title mismatch: expected {spot_data['title']}, got {created_spot['title']}")
                        continue
                    
                    if created_spot["latitude"] != spot_data["latitude"]:
                        self.log_error(f"Create Spot {i+1}", f"Latitude mismatch: expected {spot_data['latitude']}, got {created_spot['latitude']}")
                        continue
                    
                    if created_spot["longitude"] != spot_data["longitude"]:
                        self.log_error(f"Create Spot {i+1}", f"Longitude mismatch: expected {spot_data['longitude']}, got {created_spot['longitude']}")
                        continue
                    
                    # Validate datetime format
                    try:
                        datetime.fromisoformat(created_spot["created_at"].replace('Z', '+00:00'))
                    except ValueError:
                        self.log_error(f"Create Spot {i+1}", f"Invalid datetime format: {created_spot['created_at']}")
                        continue
                    
                    self.created_spots.append(created_spot)
                    self.log_success(f"Create Spot {i+1}", f"Created spot '{created_spot['title']}' with ID: {created_spot['id']}")
                    
                else:
                    self.log_error(f"Create Spot {i+1}", f"Status {response.status_code}: {response.text}")
                    
            except requests.exceptions.RequestException as e:
                self.log_error(f"Create Spot {i+1}", f"Connection error: {e}")
            except Exception as e:
                self.log_error(f"Create Spot {i+1}", f"Unexpected error: {e}")
        
        if len(self.created_spots) == len(TEST_SPOTS):
            self.test_results["create_spot"] = True
            return True
        return False

    def test_get_all_spots(self):
        """Test GET /api/spots endpoint"""
        print("\n🔍 Testing Get All Spots (GET /api/spots)...")
        
        try:
            response = requests.get(f"{API_BASE}/spots", timeout=10)
            
            if response.status_code == 200:
                spots = response.json()
                
                if not isinstance(spots, list):
                    self.log_error("Get All Spots", f"Expected list, got {type(spots)}")
                    return False
                
                if len(spots) < len(self.created_spots):
                    self.log_error("Get All Spots", f"Expected at least {len(self.created_spots)} spots, got {len(spots)}")
                    return False
                
                # Verify our created spots are in the response
                created_ids = {spot["id"] for spot in self.created_spots}
                returned_ids = {spot["id"] for spot in spots}
                
                missing_ids = created_ids - returned_ids
                if missing_ids:
                    self.log_error("Get All Spots", f"Missing created spot IDs: {missing_ids}")
                    return False
                
                # Validate structure of returned spots
                for spot in spots:
                    required_fields = ["id", "title", "description", "photo", "latitude", "longitude", "created_at"]
                    missing_fields = [field for field in required_fields if field not in spot]
                    if missing_fields:
                        self.log_error("Get All Spots", f"Spot {spot.get('id', 'unknown')} missing fields: {missing_fields}")
                        return False
                
                self.test_results["get_all_spots"] = True
                self.log_success("Get All Spots", f"Retrieved {len(spots)} spots successfully")
                return True
                
            else:
                self.log_error("Get All Spots", f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_error("Get All Spots", f"Connection error: {e}")
        except Exception as e:
            self.log_error("Get All Spots", f"Unexpected error: {e}")
        
        return False

    def test_get_single_spot(self):
        """Test GET /api/spots/{spot_id} endpoint"""
        print("\n🔍 Testing Get Single Spot (GET /api/spots/{id})...")
        
        if not self.created_spots:
            self.log_error("Get Single Spot", "No created spots to test with")
            return False
        
        success_count = 0
        for spot in self.created_spots:
            spot_id = spot["id"]
            try:
                response = requests.get(f"{API_BASE}/spots/{spot_id}", timeout=10)
                
                if response.status_code == 200:
                    retrieved_spot = response.json()
                    
                    # Validate the retrieved spot matches the original
                    if retrieved_spot["id"] != spot["id"]:
                        self.log_error(f"Get Single Spot {spot_id}", f"ID mismatch: expected {spot['id']}, got {retrieved_spot['id']}")
                        continue
                    
                    if retrieved_spot["title"] != spot["title"]:
                        self.log_error(f"Get Single Spot {spot_id}", f"Title mismatch: expected {spot['title']}, got {retrieved_spot['title']}")
                        continue
                    
                    if retrieved_spot["latitude"] != spot["latitude"]:
                        self.log_error(f"Get Single Spot {spot_id}", f"Latitude mismatch: expected {spot['latitude']}, got {retrieved_spot['latitude']}")
                        continue
                    
                    success_count += 1
                    self.log_success(f"Get Single Spot", f"Retrieved spot '{retrieved_spot['title']}' successfully")
                    
                elif response.status_code == 404:
                    self.log_error(f"Get Single Spot {spot_id}", "Spot not found (404)")
                else:
                    self.log_error(f"Get Single Spot {spot_id}", f"Status {response.status_code}: {response.text}")
                    
            except requests.exceptions.RequestException as e:
                self.log_error(f"Get Single Spot {spot_id}", f"Connection error: {e}")
            except Exception as e:
                self.log_error(f"Get Single Spot {spot_id}", f"Unexpected error: {e}")
        
        if success_count == len(self.created_spots):
            self.test_results["get_single_spot"] = True
            return True
        return False

    def test_get_nonexistent_spot(self):
        """Test GET /api/spots/{spot_id} with non-existent ID"""
        print("\n🔍 Testing Get Non-existent Spot...")
        
        fake_id = str(uuid.uuid4())
        try:
            response = requests.get(f"{API_BASE}/spots/{fake_id}", timeout=10)
            
            if response.status_code == 404:
                self.log_success("Get Non-existent Spot", "Correctly returned 404 for non-existent spot")
                return True
            else:
                self.log_error("Get Non-existent Spot", f"Expected 404, got {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_error("Get Non-existent Spot", f"Connection error: {e}")
        except Exception as e:
            self.log_error("Get Non-existent Spot", f"Unexpected error: {e}")
        
        return False

    def test_delete_spot(self):
        """Test DELETE /api/spots/{spot_id} endpoint"""
        print("\n🔍 Testing Delete Spot (DELETE /api/spots/{id})...")
        
        if not self.created_spots:
            self.log_error("Delete Spot", "No created spots to test with")
            return False
        
        # Test deleting one spot
        spot_to_delete = self.created_spots[0]
        spot_id = spot_to_delete["id"]
        
        try:
            response = requests.delete(f"{API_BASE}/spots/{spot_id}", timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log_success("Delete Spot", f"Deleted spot '{spot_to_delete['title']}' successfully")
                    
                    # Verify the spot is actually deleted by trying to get it
                    get_response = requests.get(f"{API_BASE}/spots/{spot_id}", timeout=10)
                    if get_response.status_code == 404:
                        self.log_success("Delete Verification", "Spot correctly not found after deletion")
                        self.test_results["delete_spot"] = True
                        return True
                    else:
                        self.log_error("Delete Verification", f"Spot still exists after deletion: {get_response.status_code}")
                else:
                    self.log_error("Delete Spot", f"Unexpected response format: {result}")
            else:
                self.log_error("Delete Spot", f"Status {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_error("Delete Spot", f"Connection error: {e}")
        except Exception as e:
            self.log_error("Delete Spot", f"Unexpected error: {e}")
        
        return False

    def test_delete_nonexistent_spot(self):
        """Test DELETE /api/spots/{spot_id} with non-existent ID"""
        print("\n🔍 Testing Delete Non-existent Spot...")
        
        fake_id = str(uuid.uuid4())
        try:
            response = requests.delete(f"{API_BASE}/spots/{fake_id}", timeout=10)
            
            if response.status_code == 404:
                self.log_success("Delete Non-existent Spot", "Correctly returned 404 for non-existent spot")
                return True
            else:
                self.log_error("Delete Non-existent Spot", f"Expected 404, got {response.status_code}: {response.text}")
                
        except requests.exceptions.RequestException as e:
            self.log_error("Delete Non-existent Spot", f"Connection error: {e}")
        except Exception as e:
            self.log_error("Delete Non-existent Spot", f"Unexpected error: {e}")
        
        return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("=" * 60)
        print("🚀 Starting Drop the Spot Backend API Tests")
        print("=" * 60)
        
        # Test sequence
        tests = [
            ("API Health", self.test_api_health),
            ("Create Spot", self.test_create_spot),
            ("Get All Spots", self.test_get_all_spots),
            ("Get Single Spot", self.test_get_single_spot),
            ("Get Non-existent Spot", self.test_get_nonexistent_spot),
            ("Delete Spot", self.test_delete_spot),
            ("Delete Non-existent Spot", self.test_delete_nonexistent_spot),
        ]
        
        for test_name, test_func in tests:
            success = test_func()
            if not success and test_name in ["API Health", "Create Spot"]:
                print(f"\n❌ Critical test '{test_name}' failed. Stopping further tests.")
                break
        
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results) - 1  # Exclude 'errors' key
        passed_tests = sum(1 for k, v in self.test_results.items() if k != "errors" and v)
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        
        print("\nDetailed Results:")
        for test_name, result in self.test_results.items():
            if test_name != "errors":
                status = "✅ PASS" if result else "❌ FAIL"
                print(f"  {test_name}: {status}")
        
        if self.test_results["errors"]:
            print(f"\n❌ Errors ({len(self.test_results['errors'])}):")
            for error in self.test_results["errors"]:
                print(f"  - {error}")
        
        # Overall status
        if passed_tests == total_tests:
            print(f"\n🎉 ALL TESTS PASSED! Backend API is working correctly.")
        else:
            print(f"\n⚠️  {total_tests - passed_tests} test(s) failed. Backend needs attention.")

if __name__ == "__main__":
    tester = BackendTester()
    tester.run_all_tests()