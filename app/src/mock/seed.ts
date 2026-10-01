/* Static seed for the mock estate. Totals are chosen so the estate view
   reconciles with the reference screens: 24 datacenters (21 on-air, 2 in
   progress, 1 planned), 210 PoPs and 1,520 sites across 20 circles. */

import type { Blocker, RolloutStatus } from '../api/types';

export const NOW = new Date(2026, 9, 1, 13, 20, 0).getTime();
export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

export const REGIONS = [
  { id: 'north', name: 'North' }, { id: 'east', name: 'East' }, { id: 'west', name: 'West' }, { id: 'south', name: 'South' }
];

/* [id, name/state, region, lat, lng, PoPs, sites] */
export const CIRCLES: [string, string, string, number, number, number, number][] = [
  ['MH', 'Maharashtra', 'west', 19.2, 75.3, 32, 212],
  ['UP', 'Uttar Pradesh', 'north', 26.9, 80.9, 27, 191],
  ['KA', 'Karnataka', 'south', 14.5, 75.7, 26, 182],
  ['MP', 'Madhya Pradesh', 'west', 23.4, 77.9, 24, 168],
  ['DL', 'Delhi NCR', 'north', 28.6, 77.2, 22, 151],
  ['TN', 'Tamil Nadu', 'south', 11.1, 78.6, 19, 133],
  ['GJ', 'Gujarat', 'west', 22.6, 71.8, 18, 132],
  ['AP', 'Andhra Pradesh', 'south', 15.9, 79.7, 17, 124],
  ['WB', 'West Bengal', 'east', 23.0, 87.8, 3, 33],
  ['TS', 'Telangana', 'south', 17.9, 79.1, 2, 27],
  ['RJ', 'Rajasthan', 'north', 26.6, 73.8, 3, 26],
  ['KL', 'Kerala', 'south', 10.3, 76.4, 2, 22],
  ['OD', 'Odisha', 'east', 20.5, 84.4, 2, 19],
  ['HR', 'Haryana', 'north', 29.2, 76.1, 2, 18],
  ['PB', 'Punjab', 'north', 31.0, 75.4, 2, 17],
  ['BR', 'Bihar', 'east', 25.7, 85.6, 2, 16],
  ['AS', 'Assam', 'east', 26.2, 92.5, 2, 15],
  ['JH', 'Jharkhand', 'east', 23.6, 85.3, 2, 13],
  ['CG', 'Chhattisgarh', 'east', 21.3, 81.9, 2, 12],
  ['UK', 'Uttarakhand', 'north', 30.1, 79.0, 1, 9]
];

/* [id, city, address, circle, status, ne, discovered, drifted, lat, lng, category, tier] */
export const DCS: [string, string, string, string, RolloutStatus, number, number, number, number, number, 'Central' | 'Regional' | 'Edge', 'Tier II' | 'Tier III' | 'Tier IV'][] = [
  ['MH-DC-001', 'Pune', 'Pune Data Park', 'MH', 'in-progress', 179, 103, 21, 18.593, 73.789, 'Central', 'Tier III'],
  ['MH-DC-002', 'Pune', 'Pune Data Park', 'MH', 'on-air', 90, 90, 2, 18.601, 73.762, 'Central', 'Tier III'],
  ['MH-DC-003', 'Nagpur', 'Nagpur Data Park', 'MH', 'on-air', 114, 114, 4, 21.146, 79.088, 'Central', 'Tier III'],
  ['MH-DC-004', 'Pune', 'Pune Data Park', 'MH', 'on-air', 66, 66, 0, 18.552, 73.931, 'Central', 'Tier II'],
  ['UP-DC-005', 'Gorakhpur', 'Gorakhpur Data Park', 'UP', 'on-air', 140, 140, 3, 26.760, 83.373, 'Central', 'Tier III'],
  ['UP-DC-006', 'Prayagraj', 'Prayagraj Data Park', 'UP', 'on-air', 110, 110, 1, 25.435, 81.846, 'Central', 'Tier III'],
  ['UP-DC-007', 'Prayagraj', 'Prayagraj Data Park', 'UP', 'on-air', 84, 84, 0, 25.452, 81.810, 'Central', 'Tier II'],
  ['KA-DC-008', 'Mangaluru', 'Mangaluru Data Park', 'KA', 'on-air', 144, 144, 5, 12.914, 74.856, 'Central', 'Tier III'],
  ['DL-DC-009', 'New Delhi', 'Okhla Phase III', 'DL', 'on-air', 168, 168, 6, 28.546, 77.272, 'Central', 'Tier IV'],
  ['AP-DC-010', 'Visakhapatnam', 'Vizag IT Park', 'AP', 'on-air', 72, 72, 1, 17.735, 83.316, 'Regional', 'Tier II'],
  ['HR-DC-011', 'Gurugram', 'Udyog Vihar Ph IV', 'HR', 'on-air', 126, 126, 3, 28.501, 77.084, 'Central', 'Tier III'],
  ['PB-DC-012', 'Mohali', 'Mohali IT City', 'PB', 'on-air', 64, 64, 0, 30.704, 76.717, 'Regional', 'Tier II'],
  ['GJ-DC-013', 'Ahmedabad', 'GIFT City Block 12', 'GJ', 'planned', 48, 0, 0, 23.163, 72.680, 'Central', 'Tier III'],
  ['MP-DC-014', 'Indore', 'Super Corridor', 'MP', 'on-air', 96, 96, 2, 22.785, 75.877, 'Regional', 'Tier III'],
  ['RJ-DC-015', 'Jaipur', 'Sitapura Industrial Area', 'RJ', 'on-air', 70, 70, 1, 26.780, 75.832, 'Regional', 'Tier II'],
  ['WB-DC-016', 'Kolkata', 'Salt Lake Sector V', 'WB', 'on-air', 132, 132, 4, 22.573, 88.433, 'Central', 'Tier III'],
  ['WB-DC-017', 'Kolkata', 'New Town Action Area II', 'WB', 'on-air', 88, 88, 1, 22.590, 88.480, 'Regional', 'Tier II'],
  ['OD-DC-018', 'Bhubaneswar', 'Infocity Patia', 'OD', 'on-air', 62, 62, 0, 20.346, 85.816, 'Regional', 'Tier II'],
  ['BR-DC-019', 'Patna', 'Patliputra Industrial Area', 'BR', 'on-air', 58, 58, 1, 25.629, 85.104, 'Edge', 'Tier II'],
  ['KA-DC-020', 'Bengaluru', 'Whitefield EPIP Zone', 'KA', 'on-air', 172, 172, 5, 12.981, 77.728, 'Central', 'Tier IV'],
  ['KA-DC-021', 'Bengaluru', 'Electronic City Ph II', 'KA', 'on-air', 118, 118, 2, 12.840, 77.676, 'Central', 'Tier III'],
  ['TN-DC-022', 'Chennai', 'Ambattur Industrial Estate', 'TN', 'on-air', 150, 150, 3, 13.098, 80.162, 'Central', 'Tier III'],
  ['TS-DC-023', 'Hyderabad', 'HITEC City Phase 2', 'TS', 'on-air', 136, 136, 2, 17.447, 78.376, 'Central', 'Tier III'],
  ['KL-DC-024', 'Kochi', 'Infopark Kakkanad', 'KL', 'in-progress', 72, 40, 3, 10.012, 76.360, 'Regional', 'Tier II']
];

/* rollout status split for non-DC locations — totals match the estate view */
export const POP_STATUS: Record<RolloutStatus, number> = { 'on-air': 165, 'in-progress': 27, planned: 15, failed: 3 };
export const SITE_STATUS: Record<RolloutStatus, number> = { 'on-air': 1046, 'in-progress': 207, planned: 236, failed: 31 };

export const BLOCKERS: [Blocker, string][] = [
  ['power', 'Battery backup below threshold'], ['fiber', 'Fiber cut on feeder route'], ['commissioning', 'Site acceptance testing incomplete'],
  ['supply', 'Equipment delivery delayed'], ['lease', 'Repeated landlord access restriction'], ['civil', 'Civil work pending for shelter / tower base'],
  ['regulatory', 'Municipal approval pending']
];

export const CITIES: Record<string, string[]> = {
  MH: ['Pune', 'Mumbai', 'Nagpur', 'Nashik', 'Aurangabad', 'Kolhapur', 'Solapur', 'Thane'], UP: ['Lucknow', 'Kanpur', 'Prayagraj', 'Gorakhpur', 'Varanasi', 'Agra', 'Meerut', 'Noida'],
  KA: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi', 'Kalaburagi'], MP: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar'],
  DL: ['New Delhi', 'Dwarka', 'Rohini', 'Saket', 'Okhla'], TN: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'], GJ: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar'],
  AP: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Nellore'], WB: ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri'], TS: ['Hyderabad', 'Warangal', 'Karimnagar'],
  RJ: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'], KL: ['Kochi', 'Thiruvananthapuram', 'Kozhikode'], OD: ['Bhubaneswar', 'Cuttack', 'Rourkela'], HR: ['Gurugram', 'Faridabad', 'Panipat'],
  PB: ['Mohali', 'Ludhiana', 'Amritsar'], BR: ['Patna', 'Gaya', 'Muzaffarpur'], AS: ['Guwahati', 'Dibrugarh'], JH: ['Ranchi', 'Jamshedpur'], CG: ['Raipur', 'Bilaspur'], UK: ['Dehradun', 'Haridwar']
};

export const CUSTOMERS: [string, string, string, string, string, boolean][] = [
  ['Enterprise Corp', 'Enterprise', 'Pune', 'Maharashtra', 'Premium L3VPN', true],
  ['Telecom Provider', 'Carrier', 'Chennai', 'Tamil Nadu', 'Enterprise L2VPN', true],
  ['Finance Group', 'BFSI', 'Bengaluru', 'Karnataka', 'Enterprise Leased Line', true],
  ['Media Corporation', 'Media', 'Mumbai', 'Maharashtra', 'Business L3VPN', false],
  ['Logistics Partners', 'Enterprise', 'Hyderabad', 'Telangana', 'Premium IRV', true],
  ['Retail Chain', 'Enterprise', 'Mumbai', 'Maharashtra', 'Premium L3VPN', true],
  ['Education Institute', 'Government', 'Pune', 'Maharashtra', 'Business L2VPN', false],
  ['Health Network', 'Healthcare', 'New Delhi', 'Delhi NCR', 'Business L3VPN', true],
  ['State Revenue Department', 'Government', 'Lucknow', 'Uttar Pradesh', 'Government L3VPN', true],
  ['Metro Transit Authority', 'Government', 'Kolkata', 'West Bengal', 'Enterprise Leased Line', true],
  ['Cooperative Bank', 'BFSI', 'Nagpur', 'Maharashtra', 'Enterprise L2VPN', false],
  ['Insurance Services', 'BFSI', 'Gurugram', 'Haryana', 'Premium L3VPN', true],
  ['Pharma Manufacturing', 'Enterprise', 'Ahmedabad', 'Gujarat', 'Business Leased Line', false],
  ['Auto Components Ltd', 'Enterprise', 'Pune', 'Maharashtra', 'Business L2VPN', false],
  ['Broadcast Network', 'Media', 'New Delhi', 'Delhi NCR', 'Premium IRV', true],
  ['Regional ISP', 'Carrier', 'Indore', 'Madhya Pradesh', 'Wholesale IRV', false],
  ['Cloud Exchange', 'Carrier', 'Bengaluru', 'Karnataka', 'Wholesale L2VPN', true],
  ['University Consortium', 'Government', 'Prayagraj', 'Uttar Pradesh', 'Education L3VPN', false],
  ['Hospital Chain', 'Healthcare', 'Chennai', 'Tamil Nadu', 'Business L3VPN', false],
  ['Payments Gateway', 'BFSI', 'Mumbai', 'Maharashtra', 'Premium Leased Line', true],
  ['Port Trust', 'Government', 'Visakhapatnam', 'Andhra Pradesh', 'Government Leased Line', false],
  ['Textile Exports', 'Enterprise', 'Surat', 'Gujarat', 'Business IRV', false],
  ['Smart City Mission', 'Government', 'Indore', 'Madhya Pradesh', 'Government L2VPN', false],
  ['Stock Broking House', 'BFSI', 'Mumbai', 'Maharashtra', 'Premium L3VPN', true],
  ['Gaming Studio', 'Media', 'Hyderabad', 'Telangana', 'Business IRV', false],
  ['Agri Commodities', 'Enterprise', 'Jaipur', 'Rajasthan', 'Business L2VPN', false],
  ['Diagnostics Labs', 'Healthcare', 'Kochi', 'Kerala', 'Business Leased Line', false],
  ['Steel Works', 'Enterprise', 'Jamshedpur', 'Jharkhand', 'Enterprise Leased Line', false],
  ['Mobile Operator', 'Carrier', 'Kolkata', 'West Bengal', 'Wholesale L2VPN', true],
  ['E-commerce Marketplace', 'Enterprise', 'Bengaluru', 'Karnataka', 'Premium IRV', true],
  ['Power Utility', 'Government', 'Bhubaneswar', 'Odisha', 'Government L3VPN', false],
  ['Hotel Group', 'Enterprise', 'Jaipur', 'Rajasthan', 'Business L3VPN', false],
  ['Newspaper Group', 'Media', 'Patna', 'Bihar', 'Business IRV', false],
  ['Microfinance Bank', 'BFSI', 'Kolkata', 'West Bengal', 'Business L2VPN', false],
  ['Airport Operator', 'Enterprise', 'New Delhi', 'Delhi NCR', 'Premium Leased Line', true],
  ['Research Institute', 'Government', 'Bengaluru', 'Karnataka', 'Education L3VPN', false]
];

export const PEOPLE = ['Mike Johnson', 'Priya Nair', 'Arjun Mehta', 'Sarah Chen', 'Rahul Deshpande', 'Kavita Rao', 'David Kim', 'Anil Kulkarni', 'Meera Iyer', 'James Wilson', 'Sneha Patil', 'Vikram Singh'];
export const ACCOUNT_MANAGERS = ['Neha Kapoor', 'Rohan Joshi', 'Ananya Sen', 'Karthik Raman', 'Pooja Verma'];
