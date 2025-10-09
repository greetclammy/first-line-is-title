const fs = require('fs');
const path = require('path');

async function reorganizeIntoSubfolders(basePath, totalNotes, notesPerFolder) {
    const folderCount = Math.ceil(totalNotes / notesPerFolder);

    console.log(`Reorganizing ${totalNotes} notes into ${folderCount} subfolders...`);

    let processed = 0;

    for (let folderNum = 1; folderNum <= folderCount; folderNum++) {
        // Create subfolder
        const subfolderName = `folder-${folderNum}`;
        const subfolderPath = path.join(basePath, subfolderName);

        if (!fs.existsSync(subfolderPath)) {
            fs.mkdirSync(subfolderPath, { recursive: true });
        }

        // Calculate range of notes for this folder
        const startNote = (folderNum - 1) * notesPerFolder + 1;
        const endNote = Math.min(folderNum * notesPerFolder, totalNotes);

        // Move notes to subfolder
        for (let noteNum = startNote; noteNum <= endNote; noteNum++) {
            const fileName = `test-note-${noteNum}.md`;
            const oldPath = path.join(basePath, fileName);
            const newPath = path.join(subfolderPath, fileName);

            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
                processed++;
            }
        }

        console.log(`Created ${subfolderName} with notes ${startNote}-${endNote} (${processed}/${totalNotes} total)`);
    }

    console.log(`✓ Successfully reorganized ${processed} notes into ${folderCount} subfolders`);
}

// Configuration
const basePath = '/Users/username/Library/Mobile Documents/iCloud~md~obsidian/Documents/Dev/Test Notes';
const totalNotes = 10000;
const notesPerFolder = 100;

// Run
reorganizeIntoSubfolders(basePath, totalNotes, notesPerFolder)
    .then(() => console.log('Done!'))
    .catch(err => console.error('Error:', err));
