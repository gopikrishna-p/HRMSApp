import AsyncStorage from '@react-native-async-storage/async-storage';

class StorageService {
    // Save data
    async setItem(key, value) {
        try {
            const jsonValue = JSON.stringify(value);
            await AsyncStorage.setItem(key, jsonValue);
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            return false;
        }
    }

    // Get data
    async getItem(key) {
        try {
            const jsonValue = await AsyncStorage.getItem(key);
            return jsonValue != null ? JSON.parse(jsonValue) : null;
        } catch (error) {
            console.error('Error reading data:', error);
            return null;
        }
    }

    // Remove data
    async removeItem(key) {
        try {
            await AsyncStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing data:', error);
            return false;
        }
    }

    // Clear all data
    async clear() {
        try {
            await AsyncStorage.clear();
            return true;
        } catch (error) {
            console.error('Error clearing data:', error);
            return false;
        }
    }

    // Get multiple items
    async multiGet(keys) {
        try {
            const values = await AsyncStorage.multiGet(keys);
            return values.reduce((acc, [key, value]) => {
                acc[key] = value ? JSON.parse(value) : null;
                return acc;
            }, {});
        } catch (error) {
            console.error('Error getting multiple items:', error);
            return {};
        }
    }
}

export default new StorageService();