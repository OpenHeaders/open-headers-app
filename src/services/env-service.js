// env-service.js - Service for environment variable sources

/**
 * Service for handling environment variable based sources
 */
class EnvService {
    constructor() {
        // Map of environment variable names to their associated source IDs
        // envName -> sourceIds[]
        this.sourcesByEnv = new Map();
    }

    /**
     * Watch an environment variable
     * @param {string} envName - Name of the environment variable
     * @param {number} sourceId - ID of the source
     * @returns {string} Current environment variable value
     */
    watchEnv(envName, sourceId) {
        console.log(`Setting up watch for environment variable: ${envName}`);

        if (!this.sourcesByEnv.has(envName)) {
            this.sourcesByEnv.set(envName, [sourceId]);
            console.log(`Created new watch for env var: ${envName}`);
        } else {
            const sourceIds = this.sourcesByEnv.get(envName);
            if (!sourceIds.includes(sourceId)) {
                sourceIds.push(sourceId);
                console.log(`Added source ID ${sourceId} to existing watch for env var: ${envName}`);
            }
        }

        // Get the current value
        const value = process.env[envName] || '';
        console.log(`Read environment variable ${envName}: ${value.length > 0 ? 'has value' : 'is empty'}`);

        // If the environment variable is not set at all, provide a more descriptive message
        return value || `Environment variable '${envName}' is not set`;
    }

    /**
     * Remove an environment variable watch
     * @param {number} sourceId - ID of the source
     * @param {string} envName - Name of the environment variable
     */
    removeWatch(sourceId, envName) {
        console.log(`Removing watch for source ${sourceId}, env var: ${envName}`);

        const sourceIds = this.sourcesByEnv.get(envName);
        if (!sourceIds) {
            console.log(`No watch found for env var: ${envName}`);
            return;
        }

        const updatedIds = sourceIds.filter(id => id !== sourceId);
        console.log(`Removed source ${sourceId} from watch for env var: ${envName}`);

        if (updatedIds.length === 0) {
            this.sourcesByEnv.delete(envName);
            console.log(`Removed all watches for env var: ${envName}`);
        } else {
            this.sourcesByEnv.set(envName, updatedIds);
        }
    }

    /**
     * Get the current value of an environment variable
     * @param {string} envName - Name of the environment variable
     * @returns {string} Current environment variable value
     */
    getEnvValue(envName) {
        const value = process.env[envName] || '';
        console.log(`Read environment variable ${envName}: ${value.length > 0 ? 'has value' : 'is empty'}`);

        // If the environment variable is not set at all, provide a more descriptive message
        return value || `Environment variable '${envName}' is not set`;
    }

    /**
     * Refresh all watched environment variables
     * @param {Function} onUpdate - Callback for content updates
     */
    refreshAll(onUpdate) {
        console.log('Refreshing all environment variables');

        for (const [envName, sourceIds] of this.sourcesByEnv.entries()) {
            const value = this.getEnvValue(envName);
            for (const sourceId of sourceIds) {
                console.log(`Updating source ${sourceId} with value of env var ${envName}`);
                onUpdate(sourceId, value);
            }
        }
    }

    /**
     * Dispose of all environment variable watches
     */
    dispose() {
        console.log('Disposing all environment variable watches');
        this.sourcesByEnv.clear();
    }
}

module.exports = EnvService;