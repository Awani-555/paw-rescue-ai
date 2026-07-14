const fs = require('fs');
const path = require('path');

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in km
}

function loadFacilities() {
  try {
    const facilitiesPath = path.join(__dirname, '..', 'facilities.json');
    const data = fs.readFileSync(facilitiesPath, 'utf8');
    return JSON.parse(data).facilities;
  } catch (err) {
    console.error('Error loading facilities:', err);
    return [];
  }
}

module.exports = { calculateDistance, loadFacilities };
