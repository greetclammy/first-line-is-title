#!/usr/bin/env node

/**
 * Automated test for LRU Cache Eviction Logic
 * Tests that cache evicts by access order, not insertion order
 */

// Recreate LRUCache class from cache-manager.ts
class LRUCache {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.accessOrder = new Map();
        this.accessCounter = 0;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            // Update existing entry
            this.cache.delete(key);
            this.cache.set(key, value);
            this.accessOrder.set(key, ++this.accessCounter);
        } else {
            // Add new entry, evict LRU if at capacity
            if (this.cache.size >= this.maxSize) {
                // Find key with minimum access counter (least recently used)
                let lruKey = undefined;
                let minAccess = Infinity;

                for (const [k, accessTime] of this.accessOrder) {
                    if (accessTime < minAccess) {
                        minAccess = accessTime;
                        lruKey = k;
                    }
                }

                if (lruKey !== undefined) {
                    this.cache.delete(lruKey);
                    this.accessOrder.delete(lruKey);
                }
            }

            this.cache.set(key, value);
            this.accessOrder.set(key, ++this.accessCounter);
        }
    }

    get(key) {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Update access order
            this.accessOrder.set(key, ++this.accessCounter);
        }
        return value;
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        this.accessOrder.delete(key);
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
        this.accessOrder.clear();
        this.accessCounter = 0;
    }

    size() {
        return this.cache.size;
    }

    keys() {
        return this.cache.keys();
    }
}

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log('  ✅', message);
        testsPassed++;
    } else {
        console.log('  ❌', message);
        testsFailed++;
    }
}

function assertEqual(actual, expected, message) {
    if (actual === expected) {
        console.log('  ✅', message);
        testsPassed++;
    } else {
        console.log(`  ❌ ${message}`);
        console.log(`     Expected: ${expected}, Got: ${actual}`);
        testsFailed++;
    }
}

console.log('\n🧪 LRU Cache Eviction Logic Test\n');
console.log('=' .repeat(60));

// Test 1: Basic LRU eviction
console.log('\n📋 Test 1: Basic LRU Eviction (Small Cache)');
console.log('-'.repeat(60));
{
    const cache = new LRUCache(3);

    // Fill cache
    cache.set('A', 'valueA');
    cache.set('B', 'valueB');
    cache.set('C', 'valueC');

    assert(cache.size() === 3, 'Cache filled to capacity (3/3)');

    // Access A to make it most recently used
    cache.get('A');

    // Add D - should evict B (least recently used)
    cache.set('D', 'valueD');

    assert(cache.has('A'), 'A still in cache (was accessed)');
    assert(!cache.has('B'), 'B evicted (least recently used)');
    assert(cache.has('C'), 'C still in cache');
    assert(cache.has('D'), 'D added successfully');
}

// Test 2: Frequent access prevents eviction
console.log('\n📋 Test 2: Frequent Access Prevents Eviction');
console.log('-'.repeat(60));
{
    const cache = new LRUCache(10);

    // Add 10 items (fill cache)
    for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
    }

    assertEqual(cache.size(), 10, 'Cache filled to capacity (10/10)');

    // Access first 5 items repeatedly (make them frequently used)
    for (let i = 0; i < 5; i++) {
        cache.get(`key${i}`);
        cache.get(`key${i}`);
        cache.get(`key${i}`);
    }

    // Add 5 new items - should evict key5-key9 (not key0-key4)
    for (let i = 10; i < 15; i++) {
        cache.set(`key${i}`, `value${i}`);
    }

    // Check frequently accessed items still present
    assert(cache.has('key0'), 'key0 retained (frequently accessed)');
    assert(cache.has('key1'), 'key1 retained (frequently accessed)');
    assert(cache.has('key2'), 'key2 retained (frequently accessed)');
    assert(cache.has('key3'), 'key3 retained (frequently accessed)');
    assert(cache.has('key4'), 'key4 retained (frequently accessed)');

    // Check least recently used items evicted
    assert(!cache.has('key5'), 'key5 evicted (not accessed)');
    assert(!cache.has('key6'), 'key6 evicted (not accessed)');
    assert(!cache.has('key7'), 'key7 evicted (not accessed)');
    assert(!cache.has('key8'), 'key8 evicted (not accessed)');
    assert(!cache.has('key9'), 'key9 evicted (not accessed)');
}

// Test 3: Large-scale test (simulates actual plugin use)
console.log('\n📋 Test 3: Large-Scale Test (1000 entries)');
console.log('-'.repeat(60));
{
    const cache = new LRUCache(1000);

    // Fill cache with 1000 items
    for (let i = 0; i < 1000; i++) {
        cache.set(`file${i}`, `content${i}`);
    }

    assertEqual(cache.size(), 1000, 'Cache filled to capacity (1000/1000)');

    // Access files 0-9 repeatedly (simulate frequently edited files)
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 5; j++) {
            cache.get(`file${i}`);
        }
    }

    // Add 100 new files - should trigger eviction
    for (let i = 1000; i < 1100; i++) {
        cache.set(`file${i}`, `content${i}`);
    }

    assertEqual(cache.size(), 1000, 'Cache maintained at capacity (1000/1000)');

    // Verify frequently accessed files retained
    let frequentlyAccessedRetained = 0;
    for (let i = 0; i < 10; i++) {
        if (cache.has(`file${i}`)) {
            frequentlyAccessedRetained++;
        }
    }

    assertEqual(frequentlyAccessedRetained, 10, 'All 10 frequently accessed files retained');

    // Verify some of the rarely accessed files evicted
    let rarelyAccessedEvicted = 0;
    for (let i = 10; i < 110; i++) {
        if (!cache.has(`file${i}`)) {
            rarelyAccessedEvicted++;
        }
    }

    assert(rarelyAccessedEvicted >= 90, `At least 90 rarely accessed files evicted (${rarelyAccessedEvicted}/100)`);
}

// Test 4: Update existing entry maintains access order
console.log('\n📋 Test 4: Updating Entry Updates Access Order');
console.log('-'.repeat(60));
{
    const cache = new LRUCache(3);

    cache.set('A', 'value1');
    cache.set('B', 'value2');
    cache.set('C', 'value3');

    // Update A (should move to most recently used)
    cache.set('A', 'updatedValue');

    // Add D - should evict B (oldest untouched)
    cache.set('D', 'value4');

    assert(cache.has('A'), 'A retained after update');
    assert(!cache.has('B'), 'B evicted (oldest untouched)');
    assert(cache.has('C'), 'C retained');
    assert(cache.has('D'), 'D added');
    assertEqual(cache.get('A'), 'updatedValue', 'A has updated value');
}

// Test 5: Access counter doesn't overflow
console.log('\n📋 Test 5: Access Counter Behavior (Stress Test)');
console.log('-'.repeat(60));
{
    const cache = new LRUCache(5);

    // Add items
    for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
    }

    // Perform many accesses to test counter
    for (let i = 0; i < 10000; i++) {
        cache.get('key0');
    }

    // Verify cache still works correctly
    cache.set('newKey', 'newValue');

    assert(cache.has('key0'), 'Heavily accessed item retained');
    assert(cache.size() === 5, 'Cache size maintained correctly');
    assert(cache.accessCounter > 10000, `Access counter increments (${cache.accessCounter})`);
}

// Test 6: Clear resets everything
console.log('\n📋 Test 6: Clear Resets Cache and Counters');
console.log('-'.repeat(60));
{
    const cache = new LRUCache(10);

    for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
        cache.get(`key${i}`);
    }

    const counterBeforeClear = cache.accessCounter;
    cache.clear();

    assertEqual(cache.size(), 0, 'Cache empty after clear');
    assertEqual(cache.accessCounter, 0, 'Access counter reset to 0');
    assert(counterBeforeClear > 0, `Counter was incremented before clear (${counterBeforeClear})`);
}

// Test 7: Delete removes from both maps
console.log('\n📋 Test 7: Delete Removes From Both Cache and Access Order');
console.log('-'.repeat(60));
{
    const cache = new LRUCache(5);

    cache.set('A', 'valueA');
    cache.set('B', 'valueB');
    cache.get('A'); // Access to create order entry

    const deleted = cache.delete('A');

    assert(deleted, 'Delete returns true');
    assert(!cache.has('A'), 'A removed from cache');
    assert(!cache.accessOrder.has('A'), 'A removed from access order map');
    assertEqual(cache.size(), 1, 'Size decremented correctly');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📈 Total:  ${testsPassed + testsFailed}`);
console.log('='.repeat(60));

if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! LRU cache implementation is correct.\n');
    process.exit(0);
} else {
    console.log(`\n⚠️  ${testsFailed} test(s) failed. Please review the implementation.\n`);
    process.exit(1);
}
