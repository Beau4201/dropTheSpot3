import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Fix for default markers in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [spots, setSpots] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [newSpot, setNewSpot] = useState({
    title: '',
    description: '',
    photo: '',
    latitude: 52.3676, // Default to Amsterdam
    longitude: 4.9041
  });
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const addSpotMarkerRef = useRef(null);

  // Initialize map
  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      // Initialize the map
      mapInstanceRef.current = L.map(mapRef.current).setView([52.3676, 4.9041], 13);
      
      // Add tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);

      // Get user's current location
      getCurrentLocation();
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Load spots when map is ready
  useEffect(() => {
    if (mapInstanceRef.current) {
      loadSpots();
    }
  }, [mapInstanceRef.current]);

  // Update markers when spots change
  useEffect(() => {
    if (mapInstanceRef.current && spots.length > 0) {
      updateMapMarkers();
    }
  }, [spots]);

  const getCurrentLocation = () => {
    setLocationLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ latitude, longitude });
          setNewSpot(prev => ({ ...prev, latitude, longitude }));
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setView([latitude, longitude], 15);
          }
          setLocationLoading(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          setLocationLoading(false);
        }
      );
    } else {
      setLocationLoading(false);
    }
  };

  const loadSpots = async () => {
    try {
      const response = await axios.get(`${API}/spots`);
      setSpots(response.data);
    } catch (error) {
      console.error('Error loading spots:', error);
    }
  };

  const updateMapMarkers = () => {
    // Clear existing markers
    markersRef.current.forEach(marker => mapInstanceRef.current.removeLayer(marker));
    markersRef.current = [];

    // Add markers for each spot
    spots.forEach(spot => {
      const marker = L.marker([spot.latitude, spot.longitude])
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div class="popup-content">
            <img src="${spot.photo}" alt="${spot.title}" class="popup-image" />
            <h3 class="popup-title">${spot.title}</h3>
            <p class="popup-description">${spot.description}</p>
          </div>
        `)
        .on('click', () => setSelectedSpot(spot));
      
      markersRef.current.push(marker);
    });
  };

  const handleAddSpotClick = () => {
    setShowAddForm(true);
    setSelectedSpot(null);
    
    // Add draggable marker for new spot location
    if (mapInstanceRef.current && !addSpotMarkerRef.current) {
      const lat = currentLocation ? currentLocation.latitude : 52.3676;
      const lng = currentLocation ? currentLocation.longitude : 4.9041;
      
      addSpotMarkerRef.current = L.marker([lat, lng], { draggable: true })
        .addTo(mapInstanceRef.current)
        .bindPopup('Drag me to set your spot location!')
        .on('dragend', (e) => {
          const { lat, lng } = e.target.getLatLng();
          setNewSpot(prev => ({ ...prev, latitude: lat, longitude: lng }));
        });
      
      setNewSpot(prev => ({ ...prev, latitude: lat, longitude: lng }));
    }
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    if (addSpotMarkerRef.current) {
      mapInstanceRef.current.removeLayer(addSpotMarkerRef.current);
      addSpotMarkerRef.current = null;
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setNewSpot(prev => ({ ...prev, photo: e.target.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitSpot = async (e) => {
    e.preventDefault();
    if (!newSpot.title || !newSpot.description || !newSpot.photo) {
      alert('Please fill in all fields and upload a photo');
      return;
    }

    try {
      await axios.post(`${API}/spots`, newSpot);
      setNewSpot({
        title: '',
        description: '',
        photo: '',
        latitude: currentLocation ? currentLocation.latitude : 52.3676,
        longitude: currentLocation ? currentLocation.longitude : 4.9041
      });
      setShowAddForm(false);
      
      // Remove add spot marker
      if (addSpotMarkerRef.current) {
        mapInstanceRef.current.removeLayer(addSpotMarkerRef.current);
        addSpotMarkerRef.current = null;
      }
      
      // Reload spots
      loadSpots();
    } catch (error) {
      console.error('Error creating spot:', error);
      alert('Error creating spot. Please try again.');
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1 className="header-title">Drop the Spot</h1>
          <p className="header-subtitle">Discover and share the best chill spots</p>
          <button 
            onClick={handleAddSpotClick}
            className="add-spot-btn"
          >
            + Add Spot
          </button>
        </div>
      </header>

      {/* Map Container */}
      <div className="map-container">
        <div ref={mapRef} className="map"></div>
        
        {locationLoading && (
          <div className="location-loading">
            <div className="loading-spinner"></div>
            <p>Getting your location...</p>
          </div>
        )}
      </div>

      {/* Add Spot Form Modal */}
      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Add New Spot</h2>
              <button onClick={handleCancelAdd} className="close-btn">×</button>
            </div>
            
            <form onSubmit={handleSubmitSpot} className="spot-form">
              <div className="form-group">
                <label htmlFor="title">Spot Title *</label>
                <input
                  type="text"
                  id="title"
                  value={newSpot.title}
                  onChange={(e) => setNewSpot(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Chill park corner"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description *</label>
                <textarea
                  id="description"
                  value={newSpot.description}
                  onChange={(e) => setNewSpot(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe this spot... perfect for smoking, drinking, or just hanging out"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="photo">Photo *</label>
                <input
                  type="file"
                  id="photo"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  required
                />
                {newSpot.photo && (
                  <div className="photo-preview">
                    <img src={newSpot.photo} alt="Preview" />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Location</label>
                <p className="location-info">
                  Drag the marker on the map to set the exact location
                  <br />
                  <small>Lat: {newSpot.latitude.toFixed(6)}, Lng: {newSpot.longitude.toFixed(6)}</small>
                </p>
              </div>

              <div className="form-actions">
                <button type="button" onClick={handleCancelAdd} className="cancel-btn">
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Add Spot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Spot Details Modal */}
      {selectedSpot && !showAddForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{selectedSpot.title}</h2>
              <button onClick={() => setSelectedSpot(null)} className="close-btn">×</button>
            </div>
            
            <div className="spot-details">
              <img src={selectedSpot.photo} alt={selectedSpot.title} className="spot-image" />
              <p className="spot-description">{selectedSpot.description}</p>
              <div className="spot-meta">
                <p>Added: {new Date(selectedSpot.created_at).toLocaleDateString()}</p>
                <p>Location: {selectedSpot.latitude.toFixed(6)}, {selectedSpot.longitude.toFixed(6)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>Found {spots.length} awesome spots to chill</p>
      </footer>
    </div>
  );
}

export default App;