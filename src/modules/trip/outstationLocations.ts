export interface OutstationLocation {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  distanceHint: string;
  icon: string;
  category: 'hill-station' | 'coastal' | 'heritage' | 'pilgrimage' | 'metro' | 'nature';
  isActive: boolean;
  popularityRank: number;
}

export const SUPPORTED_OUTSTATION_LOCATIONS: OutstationLocation[] = [
  // Hill Stations
  { id: 'ooty', name: 'Ooty', state: 'Tamil Nadu', lat: 11.4102, lng: 76.6950, distanceHint: '~270 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 1 },
  { id: 'kodaikanal', name: 'Kodaikanal', state: 'Tamil Nadu', lat: 10.2381, lng: 77.4892, distanceHint: '~460 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 2 },
  { id: 'munnar', name: 'Munnar', state: 'Kerala', lat: 10.0889, lng: 77.0595, distanceHint: '~480 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 3 },
  { id: 'coorg', name: 'Coorg', state: 'Karnataka', lat: 12.3375, lng: 75.8069, distanceHint: '~250 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 4 },
  { id: 'chikmagalur', name: 'Chikmagalur', state: 'Karnataka', lat: 13.3161, lng: 75.7720, distanceHint: '~240 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 5 },
  { id: 'wayanad', name: 'Wayanad', state: 'Kerala', lat: 11.6854, lng: 76.1320, distanceHint: '~280 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 6 },
  { id: 'yelagiri', name: 'Yelagiri', state: 'Tamil Nadu', lat: 12.5810, lng: 78.6360, distanceHint: '~230 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 7 },
  { id: 'yercaud', name: 'Yercaud', state: 'Tamil Nadu', lat: 11.7750, lng: 78.2050, distanceHint: '~360 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 8 },
  { id: 'nandi-hills', name: 'Nandi Hills', state: 'Karnataka', lat: 13.3702, lng: 77.6835, distanceHint: '~60 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 9 },
  { id: 'shimla', name: 'Shimla', state: 'Himachal Pradesh', lat: 31.1048, lng: 77.1734, distanceHint: '~2200 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 10 },
  { id: 'manali', name: 'Manali', state: 'Himachal Pradesh', lat: 32.2396, lng: 77.1887, distanceHint: '~2300 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 11 },
  { id: 'mussoorie', name: 'Mussoorie', state: 'Uttarakhand', lat: 30.4598, lng: 78.0644, distanceHint: '~2250 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 12 },
  { id: 'nainital', name: 'Nainital', state: 'Uttarakhand', lat: 29.3919, lng: 79.4542, distanceHint: '~2200 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 13 },
  { id: 'darjeeling', name: 'Darjeeling', state: 'West Bengal', lat: 27.0410, lng: 88.2663, distanceHint: '~2100 km', icon: 'pine-tree', category: 'hill-station', isActive: true, popularityRank: 14 },

  // Coastal
  { id: 'pondicherry', name: 'Pondicherry', state: 'Puducherry', lat: 11.9416, lng: 79.8083, distanceHint: '~150 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 15 },
  { id: 'goa', name: 'Goa', state: 'Goa', lat: 15.2993, lng: 74.1240, distanceHint: '~560 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 16 },
  { id: 'kanyakumari', name: 'Kanyakumari', state: 'Tamil Nadu', lat: 8.0883, lng: 77.5385, distanceHint: '~700 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 17 },
  { id: 'vizag', name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185, distanceHint: '~800 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 18 },
  { id: 'alleppey', name: 'Alleppey', state: 'Kerala', lat: 9.4981, lng: 76.3388, distanceHint: '~640 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 19 },
  { id: 'kovalam', name: 'Kovalam', state: 'Kerala', lat: 8.3988, lng: 76.9780, distanceHint: '~720 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 20 },
  { id: 'varkala', name: 'Varkala', state: 'Kerala', lat: 8.7379, lng: 76.7163, distanceHint: '~690 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 21 },
  { id: 'gokarna', name: 'Gokarna', state: 'Karnataka', lat: 14.5479, lng: 74.3188, distanceHint: '~480 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 22 },
  { id: 'puri', name: 'Puri', state: 'Odisha', lat: 19.8135, lng: 85.8312, distanceHint: '~1200 km', icon: 'beach', category: 'coastal', isActive: true, popularityRank: 23 },

  // Heritage & Culture
  { id: 'mysore', name: 'Mysore', state: 'Karnataka', lat: 12.2958, lng: 76.6394, distanceHint: '~150 km', icon: 'castle', category: 'heritage', isActive: true, popularityRank: 24 },
  { id: 'hampi', name: 'Hampi', state: 'Karnataka', lat: 15.3350, lng: 76.4600, distanceHint: '~340 km', icon: 'castle', category: 'heritage', isActive: true, popularityRank: 25 },
  { id: 'madurai', name: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198, distanceHint: '~460 km', icon: 'castle', category: 'heritage', isActive: true, popularityRank: 26 },
  { id: 'thanjavur', name: 'Thanjavur', state: 'Tamil Nadu', lat: 10.7870, lng: 79.1378, distanceHint: '~340 km', icon: 'castle', category: 'heritage', isActive: true, popularityRank: 27 },
  { id: 'mahabalipuram', name: 'Mahabalipuram', state: 'Tamil Nadu', lat: 12.6269, lng: 80.1927, distanceHint: '~60 km', icon: 'castle', category: 'heritage', isActive: true, popularityRank: 28 },
  { id: 'agra', name: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081, distanceHint: '~2000 km', icon: 'castle', category: 'heritage', isActive: true, popularityRank: 29 },
  { id: 'jaipur', name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, distanceHint: '~1900 km', icon: 'castle', category: 'heritage', isActive: true, popularityRank: 30 },
  { id: 'udaipur', name: 'Udaipur', state: 'Rajasthan', lat: 24.5854, lng: 73.7125, distanceHint: '~1800 km', icon: 'castle', category: 'heritage', isActive: true, popularityRank: 31 },

  // Pilgrimage
  { id: 'tirupati', name: 'Tirupati', state: 'Andhra Pradesh', lat: 13.6288, lng: 79.4192, distanceHint: '~140 km', icon: 'temple-hindu', category: 'pilgrimage', isActive: true, popularityRank: 32 },
  { id: 'rameswaram', name: 'Rameswaram', state: 'Tamil Nadu', lat: 9.2876, lng: 79.3129, distanceHint: '~580 km', icon: 'temple-hindu', category: 'pilgrimage', isActive: true, popularityRank: 33 },
  { id: 'kumbakonam', name: 'Kumbakonam', state: 'Tamil Nadu', lat: 10.9617, lng: 79.3881, distanceHint: '~290 km', icon: 'temple-hindu', category: 'pilgrimage', isActive: true, popularityRank: 34 },
  { id: 'varanasi', name: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739, distanceHint: '~1800 km', icon: 'temple-hindu', category: 'pilgrimage', isActive: true, popularityRank: 35 },
  { id: 'rishikesh', name: 'Rishikesh', state: 'Uttarakhand', lat: 30.0869, lng: 78.2676, distanceHint: '~2200 km', icon: 'temple-hindu', category: 'pilgrimage', isActive: true, popularityRank: 36 },
  { id: 'haridwar', name: 'Haridwar', state: 'Uttarakhand', lat: 29.9457, lng: 78.1642, distanceHint: '~2180 km', icon: 'temple-hindu', category: 'pilgrimage', isActive: true, popularityRank: 37 },
  { id: 'shirdi', name: 'Shirdi', state: 'Maharashtra', lat: 19.7667, lng: 74.4772, distanceHint: '~1150 km', icon: 'temple-hindu', category: 'pilgrimage', isActive: true, popularityRank: 38 },

  // Major Metros
  { id: 'bangalore', name: 'Bangalore', state: 'Karnataka', lat: 12.9716, lng: 77.5946, distanceHint: '~350 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 39 },
  { id: 'hyderabad', name: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867, distanceHint: '~630 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 40 },
  { id: 'coimbatore', name: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558, distanceHint: '~500 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 41 },
  { id: 'trichy', name: 'Trichy', state: 'Tamil Nadu', lat: 10.7905, lng: 78.7047, distanceHint: '~330 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 42 },
  { id: 'salem', name: 'Salem', state: 'Tamil Nadu', lat: 11.6643, lng: 78.1460, distanceHint: '~340 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 43 },
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777, distanceHint: '~1330 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 44 },
  { id: 'pune', name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, distanceHint: '~1170 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 45 },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, distanceHint: '~600 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 46 },
  { id: 'vellore', name: 'Vellore', state: 'Tamil Nadu', lat: 12.9165, lng: 79.1325, distanceHint: '~140 km', icon: 'city', category: 'metro', isActive: true, popularityRank: 47 },

  // Nature & Wildlife
  { id: 'lonavala', name: 'Lonavala', state: 'Maharashtra', lat: 18.7546, lng: 73.4062, distanceHint: '~1130 km', icon: 'nature', category: 'nature', isActive: true, popularityRank: 48 },
  { id: 'mahabaleshwar', name: 'Mahabaleshwar', state: 'Maharashtra', lat: 17.9307, lng: 73.6477, distanceHint: '~1050 km', icon: 'nature', category: 'nature', isActive: true, popularityRank: 49 },
  { id: 'thekkady', name: 'Thekkady', state: 'Kerala', lat: 9.5848, lng: 77.1612, distanceHint: '~530 km', icon: 'nature', category: 'nature', isActive: true, popularityRank: 50 },
  { id: 'bandipur', name: 'Bandipur', state: 'Karnataka', lat: 11.6690, lng: 76.6349, distanceHint: '~290 km', icon: 'nature', category: 'nature', isActive: true, popularityRank: 51 },
  { id: 'kabini', name: 'Kabini', state: 'Karnataka', lat: 11.9167, lng: 76.2500, distanceHint: '~220 km', icon: 'nature', category: 'nature', isActive: true, popularityRank: 52 },
];
