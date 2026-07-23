export const HEALTH_COLORS = {
  EXCELLENT: '#00A86B',
  GOOD: '#28A745',
  AVERAGE: '#FFC107',
  POOR: '#FD7E14',
  CRITICAL: '#DC3545',
};

export const SENSOR_LABELS = {
  PH: 'pH Level',
  TEMPERATURE: 'Temperature (°C)',
  PRESSURE: 'Pressure (bar)',
  GAS_FLOW: 'Gas Flow (m³/h)',
  METHANE: 'Methane (%)',
  CARBON_DIOXIDE: 'CO₂ (%)',
  HYDROGEN_SULFIDE: 'H₂S (ppm)',
  AMMONIA: 'NH₃ (ppm)',
  HUMIDITY: 'Humidity (%)',
  LIQUID_LEVEL: 'Liquid Level (%)',
  PRESSURE_TRANSMITTER: 'Pressure Indicator Transmitter',
  FLOW_TRANSMITTER: 'Flow Indicator Transmitter',
  TEMPERATURE_TRANSMITTER: 'Temperature Transmitter',
};

export const SENSOR_UNITS = {
  PH: '', TEMPERATURE: '°C', PRESSURE: 'bar', GAS_FLOW: 'm³/h',
  METHANE: '%', CARBON_DIOXIDE: '%', HYDROGEN_SULFIDE: 'ppm',
  AMMONIA: 'ppm', HUMIDITY: '%', LIQUID_LEVEL: '%',
  PRESSURE_TRANSMITTER: 'bar', FLOW_TRANSMITTER: 'm³/h', TEMPERATURE_TRANSMITTER: '°C',
};

export const PLANT_TYPES = [
  'BIOGAS', 'BIO_CNG', 'SANITATION', 'STP', 'ORGANIC_WASTE', 'WASTE_TO_ENERGY',
];

export const SENSOR_TYPES = [
  'PH', 'TEMPERATURE', 'PRESSURE', 'GAS_FLOW', 'METHANE',
  'CARBON_DIOXIDE', 'HYDROGEN_SULFIDE', 'AMMONIA', 'HUMIDITY', 'LIQUID_LEVEL',
  'PRESSURE_TRANSMITTER', 'FLOW_TRANSMITTER', 'TEMPERATURE_TRANSMITTER',
];

/** Common SaaS hardware bundles for biogas projects */
export const HARDWARE_PRESETS = {
  ESP_HUB: ['TEMPERATURE', 'HUMIDITY', 'METHANE'],
  TRANSMITTERS: ['PRESSURE_TRANSMITTER', 'FLOW_TRANSMITTER', 'TEMPERATURE_TRANSMITTER'],
};

export const formatPlantType = (type) => type?.replace(/_/g, ' ') || '';

export const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString();
};

export const getHealthColor = (status) => HEALTH_COLORS[status] || '#6c757d';

export const getSensorTypesForPlant = (plant, allTypes = SENSOR_TYPES) => {
  const enabled = plant?.enabledSensorTypes || [];
  if (!enabled.length) return allTypes;
  return allTypes.filter((type) => enabled.includes(type));
};
