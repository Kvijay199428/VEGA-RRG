import { fetchPreferences, updatePreferences } from './api';
import axios from 'axios';

const API_BASE = 'http://localhost:8080/api/rrg/config';

export const ConfigService = {
  fetchReplayConfig: async () => {
    const response = await axios.get(`${API_BASE}/replay`);
    return response.data;
  },
  
  fetchPreferences: async () => {
    return await fetchPreferences();
  },
  
  updatePreferences: async (config: any) => {
    return await updatePreferences(config);
  }
};
