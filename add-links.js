const fs = require('fs');
const path = require('path');

async function addLinksToNotes(folderPath, count) {
    console.log(`Adding links to ${count} notes in ${folderPath}...`);

    const batchSize = 100;
    let processed = 0;

    for (let i = 1; i <= count; i++) {
        const fileName = `test-note-${i}.md`;
        const filePath = path.join(folderPath, fileName);

        // Read existing content
        const content = fs.readFileSync(filePath, 'utf8');

        // Add link to next note (except for last note)
        let newContent;
        if (i < count) {
            const nextNote = `test-note-${i + 1}`;
            newContent = `${content}\n\n[[${nextNote}]]`;
        } else {
            // Last note links back to first
            newContent = `${content}\n\n[[test-note-1]]`;
        }

        // Write updated content
        fs.writeFileSync(filePath, newContent, 'utf8');
        processed++;

        // Progress update every batch
        if (processed % batchSize === 0) {
            console.log(`Processed ${processed}/${count} notes...`);
        }
    }

    console.log(`✓ Successfully added links to ${processed} notes`);
}

// Configuration
const folderPath = '/Users/username/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dev/Test Notes';
const noteCount = 10000;

// Run
addLinksToNotes(folderPath, noteCount)
    .then(() => console.log('Done!'))
    .catch(err => console.error('Error:', err));
