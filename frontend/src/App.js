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

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [spots, setSpots] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
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
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const addSpotMarkerRef = useRef(null);

  // Initialize authentication
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUserProfile();
    }
  }, [token]);

  // Initialize map
  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      try {
        mapInstanceRef.current = L.map(mapRef.current).setView([52.3676, 4.9041], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(mapInstanceRef.current);

        console.log('Map initialized successfully');
        getCurrentLocation();
        loadSpots();
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers when spots change
  useEffect(() => {
    if (mapInstanceRef.current && spots.length >= 0) {
      updateMapMarkers();
    }
  }, [spots]);

  // Load spots when filter changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      loadSpots();
    }
  }, [mapFilter, user]);

  const fetchUserProfile = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      delete axios.defaults.headers.common['Authorization'];
    }
  };

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
          console.log('Location found:', { latitude, longitude });
        },
        (error) => {
          console.error('Error getting location:', error);
          setLocationLoading(false);
          alert('Could not get your location. Please enable location services.');
        }
      );
    } else {
      setLocationLoading(false);
      alert('Geolocation is not supported by this browser.');
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
      alert('Location updated to your current position!');
    } else {
      getCurrentLocation();
    }
  };

  const loadSpots = async () => {
    try {
      const response = await axios.get(`${API}/spots?filter_type=${mapFilter}`);
      setSpots(response.data);
      console.log('Loaded spots:', response.data.length);
    } catch (error) {
      console.error('Error loading spots:', error);
      setSpots([]);
    }
  };

  const updateMapMarkers = () => {
    if (!mapInstanceRef.current) return;
    
    // Clear existing markers
    markersRef.current.forEach(marker => {
      try {
        mapInstanceRef.current.removeLayer(marker);
      } catch (e) {
        console.error('Error removing marker:', e);
      }
    });
    markersRef.current = [];

    // Add markers for each spot
    spots.forEach(spot => {
      try {
        const popupContent = `
          <div class="popup-content">
            ${spot.photo ? `<img src="${spot.photo}" alt="${spot.title}" class="popup-image" />` : ''}
            <h3 class="popup-title">${spot.title}</h3>
            <p class="popup-description">${spot.description}</p>
            <div class="popup-meta">
              <p><strong>By:</strong> ${spot.username || 'Anonymous'}</p>
              ${spot.average_rating > 0 ? `<div class="popup-rating">Rating: ${'★'.repeat(Math.round(spot.average_rating))} (${spot.average_rating})</div>` : ''}
            </div>
          </div>
        `;
        
        const marker = L.marker([spot.latitude, spot.longitude])
          .addTo(mapInstanceRef.current)
          .bindPopup(popupContent)
          .on('click', () => setSelectedSpot(spot));
        
        markersRef.current.push(marker);
      } catch (error) {
        console.error('Error adding marker for spot:', spot.title, error);
      }
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login`, {
        username: authForm.username,
        password: authForm.password
      });
      
      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      setShowAuthModal(false);
      setAuthForm({ username: '', email: '', password: '' });
      alert(`Welcome back, ${userData.username}!`);
    } catch (error) {
      console.error('Login error:', error);
      alert(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/register`, authForm);
      
      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      setShowAuthModal(false);
      setAuthForm({ username: '', email: '', password: '' });
      alert(`Welcome to Drop the Spot, ${userData.username}!`);
    } catch (error) {
      console.error('Registration error:', error);
      alert(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
    setMapFilter('global');
    alert('Logged out successfully');
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
    if (addSpotMarkerRef.current && mapInstanceRef.current) {
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
      alert('Please fill in title and description');
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
      
      if (addSpotMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(addSpotMarkerRef.current);
        addSpotMarkerRef.current = null;
      }
      
      alert('Spot added successfully!');
      loadSpots();
    } catch (error) {
      console.error('Error creating spot:', error);
      alert('Error creating spot. Please try again.');
    }
  };

  const handleRateSpot = async (spotId, rating) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    try {
      await axios.post(`${API}/spots/${spotId}/rate`, { rating });
      alert('Rating submitted!');
      loadSpots();
      setSelectedSpot(null);
    } catch (error) {
      console.error('Error rating spot:', error);
      alert('Error submitting rating');
    }
  };

  // Friends functionality
  const loadFriends = async () => {
    if (!user) return;
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        axios.get(`${API}/friends`),
        axios.get(`${API}/friends/requests`)
      ]);
      setFriends(friendsRes.data);
      setFriendRequests(requestsRes.data);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const searchUsers = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await axios.get(`${API}/users/search?q=${query}`);
      setSearchResults(response.data);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const sendFriendRequest = async (userId) => {
    try {
      await axios.post(`${API}/friends/request/${userId}`);
      alert('Friend request sent!');
      searchUsers(searchQuery); // Refresh search results
    } catch (error) {
      console.error('Error sending friend request:', error);
      alert(error.response?.data?.detail || 'Error sending friend request');
    }
  };

  const acceptFriendRequest = async (requestId) => {
    try {
      await axios.post(`${API}/friends/accept/${requestId}`);
      alert('Friend request accepted!');
      loadFriends();
    } catch (error) {
      console.error('Error accepting friend request:', error);
      alert('Error accepting friend request');
    }
  };

  const handleOpenFriends = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    setShowFriendsModal(true);
    loadFriends();
  };

  return (
    <div className="app">
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
                    <span>{user.friends_count || 0} friends</span>
                  </div>
                </div>
                <button onClick={handleOpenFriends} className="friends-btn">
                  👥 Friends
                </button>
                <button onClick={handleAddSpotClick} className="add-spot-btn">
                  + Add Spot
                </button>
                <button onClick={handleLogout} className="logout-btn">
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
        <div className="modal-overlay" onClick={handleCancelAdd}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
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
                    disabled={locationLoading}
                  >
                    📍 {locationLoading ? 'Getting Location...' : 'Use My Location'}
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

      {/* Friends Modal */}
      {showFriendsModal && (
        <div className="modal-overlay" onClick={() => setShowFriendsModal(false)}>
          <div className="modal large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Friends & Social</h2>
              <button onClick={() => setShowFriendsModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="friends-content">
              {/* Search Users */}
              <div className="friends-section">
                <h3>Find Friends</h3>
                <div className="search-container">
                  <input
                    type="text"
                    placeholder="Search users by username..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchUsers(e.target.value);
                    }}
                    className="search-input"
                  />
                </div>
                <div className="search-results">
                  {searchResults.map(user => (
                    <div key={user.id} className="user-item">
                      <div className="user-info">
                        <span className="username">{user.username}</span>
                        <span className="user-stats">{user.spots_count} spots</span>
                      </div>
                      {!user.is_friend && (
                        <button 
                          onClick={() => sendFriendRequest(user.id)}
                          className="friend-action-btn"
                        >
                          Add Friend
                        </button>
                      )}
                      {user.is_friend && (
                        <span className="friend-status">✅ Friends</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Friend Requests */}
              {friendRequests.length > 0 && (
                <div className="friends-section">
                  <h3>Friend Requests ({friendRequests.length})</h3>
                  {friendRequests.map(request => (
                    <div key={request.id} className="user-item">
                      <div className="user-info">
                        <span className="username">{request.from_user.username}</span>
                        <span className="request-date">
                          {new Date(request.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <button 
                        onClick={() => acceptFriendRequest(request.id)}
                        className="friend-action-btn accept"
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Friends List */}
              <div className="friends-section">
                <h3>Your Friends ({friends.length})</h3>
                {friends.length === 0 ? (
                  <p className="no-friends">No friends yet. Search and add some friends above!</p>
                ) : (
                  friends.map(friend => (
                    <div key={friend.id} className="user-item">
                      <div className="user-info">
                        <span className="username">{friend.username}</span>
                        <span className="user-stats">{friend.spots_count} spots</span>
                      </div>
                      <span className="friend-status">✅ Friends</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spot Details Modal */}
      {selectedSpot && (
        <div className="modal-overlay" onClick={() => setSelectedSpot(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedSpot.title}</h2>
              <button onClick={() => setSelectedSpot(null)} className="close-btn">×</button>
            </div>
            
            <div className="spot-details">
              {selectedSpot.photo && (
                <img src={selectedSpot.photo} alt={selectedSpot.title} className="spot-image" />
              )}
              <p className="spot-description">{selectedSpot.description}</p>
              
              {user && (
                <div className="spot-rating-section">
                  <h3>Rate this spot:</h3>
                  <div className="star-rating">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        className={`star ${star <= Math.round(selectedSpot.average_rating) ? 'active' : ''}`}
                        onClick={() => handleRateSpot(selectedSpot.id, star)}
                      >
                        ★
                      </button>
                    ))}
                    {selectedSpot.average_rating > 0 && (
                      <span className="rating-text">({selectedSpot.average_rating})</span>
                    )}
                  </div>
                  {selectedSpot.rating_count > 0 && (
                    <p className="rating-count">{selectedSpot.rating_count} rating{selectedSpot.rating_count !== 1 ? 's' : ''}</p>
                  )}
                </div>
              )}
              
              <div className="spot-meta">
                <p><strong>Added by:</strong> {selectedSpot.username || 'Anonymous'}</p>
                <p><strong>Date:</strong> {new Date(selectedSpot.created_at).toLocaleDateString()}</p>
                <p><strong>Location:</strong> {selectedSpot.latitude.toFixed(6)}, {selectedSpot.longitude.toFixed(6)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{authMode === 'login' ? 'Login' : 'Create Account'}</h2>
              <button onClick={() => setShowAuthModal(false)} className="close-btn">×</button>
            </div>
            
            <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="auth-form">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={authForm.username}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
                  required
                />
              </div>
              
              {authMode === 'register' && (
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
              )}
              
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>
              
              <button type="submit" className="submit-btn" disabled={loading}>
                {loading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Create Account')}
              </button>
              
              <p className="auth-switch">
                {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                <button 
                  type="button" 
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} 
                  className="link-btn"
                >
                  {authMode === 'login' ? 'Sign up' : 'Log in'}
                </button>
              </p>
            </form>
          </div>
        </div>
      )}

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

export default App;