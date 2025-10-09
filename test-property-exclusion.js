// Test script to verify property exclusion logic
const settings = {
  excludedProperties: [
    { key: "priority", value: "high" }
  ],
  scopeStrategy: "Enable in all notes except below"
};

// Test function similar to togglePropertyExclusion
function togglePropertyExclusion(propertyKey, propertyValue, settings) {
    const propertyToFind = `${propertyKey.trim()}:${propertyValue.trim()}`;
    const isInList = settings.excludedProperties.some(
        prop => `${prop.key.trim()}:${prop.value.trim()}` === propertyToFind
    );

    console.log(`Testing: ${propertyToFind}`);
    console.log(`Currently in exclusions: ${isInList}`);
    console.log(`Scope strategy: ${settings.scopeStrategy}`);

    let result;
    if (settings.scopeStrategy === 'Enable in all notes except below') {
        result = isInList ? 'Enable (remove from exclusions)' : 'Disable (add to exclusions)';
    } else {
        result = isInList ? 'Disable (already enabled)' : 'Enable (add to exclusions)';
    }
    
    console.log(`Should show: ${result}\n`);
}

// Test cases
togglePropertyExclusion("priority", "high", settings); // Should show "Enable"
togglePropertyExclusion("status", "draft", settings);  // Should show "Disable"  
togglePropertyExclusion("tags", "urgent", settings);   // Should show "Disable"
