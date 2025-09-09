import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import toast, { Toaster } from 'react-hot-toast';
import './App.css';

// Fix for default markers in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create custom red marker icon
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUserProfile();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { username, password });
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      toast.success(`Welcome back, ${userData.username}!`);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
      return false;
    }
  };

  const register = async (username, email, password) => {
    try {
      const response = await axios.post(`${API}/auth/register`, { username, email, password });
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      toast.success(`Welcome to Drop the Spot, ${userData.username}!`);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Auth Components
const AuthModal = ({ isOpen, onClose, mode, onSwitchMode }) => {
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    let success;
    if (mode === 'login') {
      success = await login(formData.username, formData.password);
    } else {
      success = await register(formData.username, formData.email, formData.password);
    }
    
    setLoading(false);
    if (success) {
      onClose();
      setFormData({ username: '', email: '', password: '' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal auth-modal">
        <div className="modal-header">
          <h2>{mode === 'login' ? 'Login' : 'Create Account'}</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              required
            />
          </div>
          
          {mode === 'register' && (
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
          )}
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required
            />
          </div>
          
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Processing...' : (mode === 'login' ? 'Login' : 'Create Account')}
          </button>
          
          <p className="auth-switch">
            {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={onSwitchMode} className="link-btn">
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
};

// Star Rating Component
const StarRating = ({ rating, onRate, readOnly = false }) => {
  const [hover, setHover] = useState(0);

  return (
    <div className="star-rating">
      {[...Array(5)].map((_, index) => {
        const starValue = index + 1;
        return (
          <button
            key={index}
            type="button"
            className={`star ${starValue <= (hover || rating) ? 'active' : ''}`}
            onClick={() => !readOnly && onRate && onRate(starValue)}
            onMouseEnter={() => !readOnly && setHover(starValue)}
            onMouseLeave={() => !readOnly && setHover(0)}
            disabled={readOnly}
          >
            ★
          </button>
        );
      })}
      {rating > 0 && <span className="rating-text">({rating.toFixed(1)})</span>}
    </div>
  );
};

function App() {
  const { user, loading, logout } = useAuth();
  const [spots, setSpots] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [mapFilter, setMapFilter] = useState('global');
  const [newSpot, setNewSpot] = useState({
    title: '',
    description: '',
    photo: '',
    latitude: 52.3676,
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
      mapInstanceRef.current = L.map(mapRef.current).setView([52.3676, 4.9041], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);

      getCurrentLocation();
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Load spots when map is ready or filter changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      loadSpots();
    }
  }, [mapInstanceRef.current, mapFilter, user]);

  // Update markers when spots change
  useEffect(() => {
    if (mapInstanceRef.current) {
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

  const useMyLocation = () => {
    if (currentLocation) {
      setNewSpot(prev => ({ 
        ...prev, 
        latitude: currentLocation.latitude, 
        longitude: currentLocation.longitude 
      }));
      
      // Update marker position
      if (addSpotMarkerRef.current) {
        addSpotMarkerRef.current.setLatLng([currentLocation.latitude, currentLocation.longitude]);
        mapInstanceRef.current.setView([currentLocation.latitude, currentLocation.longitude], 16);
      }
      toast.success('Location updated to your current position!');
    } else {
      getCurrentLocation();
      toast.loading('Getting your location...');
    }
  };

  const loadSpots = async () => {
    try {
      const response = await axios.get(`${API}/spots?filter_type=${mapFilter}`);
      setSpots(response.data);
    } catch (error) {
      console.error('Error loading spots:', error);
      if (error.response?.status === 401) {
        toast.error('Please log in to view filtered spots');
      }
    }
  };

  const updateMapMarkers = () => {
    // Clear existing markers
    markersRef.current.forEach(marker => mapInstanceRef.current.removeLayer(marker));
    markersRef.current = [];

    // Add markers for each spot
    spots.forEach(spot => {
      const popupContent = `
        <div class="popup-content">
          ${spot.photo ? `<img src="${spot.photo}" alt="${spot.title}" class="popup-image" />` : ''}
          <h3 class="popup-title">${spot.title}</h3>
          <p class="popup-description">${spot.description}</p>
          <div class="popup-meta">
            <p><strong>By:</strong> ${spot.username}</p>
            ${spot.average_rating > 0 ? `<div class="popup-rating">Rating: ${'★'.repeat(Math.round(spot.average_rating))} (${spot.average_rating})</div>` : ''}
          </div>
        </div>
      `;
      
      const marker = L.marker([spot.latitude, spot.longitude])
        .addTo(mapInstanceRef.current)
        .bindPopup(popupContent)
        .on('click', () => setSelectedSpot(spot));
      
      markersRef.current.push(marker);
    });
  };

  const handleAddSpotClick = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    setShowAddForm(true);
    setSelectedSpot(null);
    
    // Add draggable red marker for new spot location
    if (mapInstanceRef.current && !addSpotMarkerRef.current) {
      const lat = currentLocation ? currentLocation.latitude : 52.3676;
      const lng = currentLocation ? currentLocation.longitude : 4.9041;
      
      addSpotMarkerRef.current = L.marker([lat, lng], { 
        draggable: true,
        icon: redIcon
      })
        .addTo(mapInstanceRef.current)
        .bindPopup('🔴 Drag me to set your spot location!')
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
    if (!newSpot.title || !newSpot.description) {
      toast.error('Please fill in title and description');
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
      
      if (addSpotMarkerRef.current) {
        mapInstanceRef.current.removeLayer(addSpotMarkerRef.current);
        addSpotMarkerRef.current = null;
      }
      
      toast.success('Spot added successfully!');
      loadSpots();
    } catch (error) {
      console.error('Error creating spot:', error);
      toast.error('Error creating spot. Please try again.');
    }
  };

  const handleRateSpot = async (spotId, rating) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    try {
      await axios.post(`${API}/spots/${spotId}/rate`, { rating });
      toast.success('Rating submitted!');
      loadSpots(); // Reload to get updated ratings
      setSelectedSpot(null);
    } catch (error) {
      console.error('Error rating spot:', error);
      toast.error('Error submitting rating');
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading Drop the Spot...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-title">Drop the Spot</h1>
            <p className="header-subtitle">Discover and share the best chill spots</p>
          </div>
          
          <div className="header-center">
            {user && (
              <div className="map-filters">
                <button 
                  className={`filter-btn ${mapFilter === 'global' ? 'active' : ''}`}
                  onClick={() => setMapFilter('global')}
                >
                  🌍 Global
                </button>
                <button 
                  className={`filter-btn ${mapFilter === 'own' ? 'active' : ''}`}
                  onClick={() => setMapFilter('own')}
                >
                  📍 My Spots
                </button>
                <button 
                  className={`filter-btn ${mapFilter === 'friends' ? 'active' : ''}`}
                  onClick={() => setMapFilter('friends')}
                >
                  👥 Friends
                </button>
              </div>
            )}
          </div>
          
          <div className="header-right">
            {user ? (
              <div className="user-menu">
                <div className="user-info">
                  <span className="username">👋 {user.username}</span>
                  <div className="user-stats">
                    <span>{user.spots_count} spots</span>
                    {user.average_rating > 0 && <span>⭐ {user.average_rating}</span>}
                  </div>
                </div>
                <button onClick={handleAddSpotClick} className="add-spot-btn">
                  + Add Spot
                </button>
                <button onClick={logout} className="logout-btn">
                  Logout
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAuthModal(true)} 
                className="login-btn"
              >
                Login / Sign Up
              </button>
            )}
          </div>
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
                <label htmlFor="photo">Photo (Optional)</label>
                <input
                  type="file"
                  id="photo"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                />
                {newSpot.photo && (
                  <div className="photo-preview">
                    <img src={newSpot.photo} alt="Preview" />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Location</label>
                <div className="location-controls">
                  <button 
                    type="button" 
                    onClick={useMyLocation} 
                    className="location-btn"
                  >
                    📍 Use My Location
                  </button>
                  <p className="location-info">
                    Drag the red marker on the map to set the exact location
                    <br />
                    <small>Lat: {newSpot.latitude.toFixed(6)}, Lng: {newSpot.longitude.toFixed(6)}</small>
                  </p>
                </div>
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
              {selectedSpot.photo && (
                <img src={selectedSpot.photo} alt={selectedSpot.title} className="spot-image" />
              )}
              <p className="spot-description">{selectedSpot.description}</p>
              
              <div className="spot-rating-section">
                <h3>Rate this spot:</h3>
                <StarRating 
                  rating={selectedSpot.average_rating} 
                  onRate={(rating) => handleRateSpot(selectedSpot.id, rating)}
                  readOnly={!user}
                />
                {selectedSpot.rating_count > 0 && (
                  <p className="rating-count">{selectedSpot.rating_count} rating{selectedSpot.rating_count !== 1 ? 's' : ''}</p>
                )}
              </div>
              
              <div className="spot-meta">
                <p><strong>Added by:</strong> {selectedSpot.username}</p>
                <p><strong>Date:</strong> {new Date(selectedSpot.created_at).toLocaleDateString()}</p>
                <p><strong>Location:</strong> {selectedSpot.latitude.toFixed(6)}, {selectedSpot.longitude.toFixed(6)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        mode={authMode}
        onSwitchMode={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
      />

      {/* Footer */}
      <footer className="footer">
        <p>Found {spots.length} awesome spots to chill</p>
        {user && (
          <p>Viewing: {mapFilter === 'global' ? 'All public spots' : mapFilter === 'own' ? 'Your spots' : 'Your + friends\' spots'}</p>
        )}
      </footer>
    </div>
  );
}

// Wrap App with AuthProvider
const AppWithAuth = () => (
  <AuthProvider>
    <App />
  </AuthProvider>
);

export default AppWithAuth;