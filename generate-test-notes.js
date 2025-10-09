const fs = require('fs');
const path = require('path');

// Simple word list for random text generation
const words = [
    'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
    'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
    'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation',
    'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis',
    'aute', 'irure', 'in', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum',
    'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat', 'non',
    'proident', 'sunt', 'culpa', 'qui', 'officia', 'deserunt', 'mollit', 'anim', 'id',
    'est', 'laborum', 'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog'
];

function randomWord() {
    return words[Math.floor(Math.random() * words.length)];
}

function randomSentence() {
    const length = 5 + Math.floor(Math.random() * 10); // 5-15 words
    const sentence = [];
    for (let i = 0; i < length; i++) {
        sentence.push(randomWord());
    }
    // Capitalize first word
    sentence[0] = sentence[0].charAt(0).toUpperCase() + sentence[0].slice(1);
    return sentence.join(' ') + '.';
}

function randomParagraph() {
    const sentenceCount = 3 + Math.floor(Math.random() * 4); // 3-6 sentences
    const sentences = [];
    for (let i = 0; i < sentenceCount; i++) {
        sentences.push(randomSentence());
    }
    return sentences.join(' ');
}

function generateNote(paragraphCount) {
    const paragraphs = [];
    for (let i = 0; i < paragraphCount; i++) {
        paragraphs.push(randomParagraph());
    }
    return paragraphs.join('\n\n');
}

function randomTitle() {
    const length = 2 + Math.floor(Math.random() * 4); // 2-5 words
    const titleWords = [];
    for (let i = 0; i < length; i++) {
        const word = randomWord();
        titleWords.push(word.charAt(0).toUpperCase() + word.slice(1));
    }
    return titleWords.join(' ');
}

async function generateNotes(vaultPath, count, paragraphsPerNote) {
    const testFolder = path.join(vaultPath, 'Test Notes');

    // Create test folder if it doesn't exist
    if (!fs.existsSync(testFolder)) {
        fs.mkdirSync(testFolder, { recursive: true });
    }

    console.log(`Generating ${count} notes in ${testFolder}...`);

    const batchSize = 100;
    let created = 0;

    for (let i = 0; i < count; i++) {
        const title = randomTitle();
        const content = generateNote(paragraphsPerNote);
        const fileName = `test-note-${i + 1}.md`;
        const filePath = path.join(testFolder, fileName);

        // First line is title, then content
        const fileContent = `${title}\n\n${content}`;

        fs.writeFileSync(filePath, fileContent, 'utf8');
        created++;

        // Progress update every batch
        if (created % batchSize === 0) {
            console.log(`Created ${created}/${count} notes...`);
        }
    }

    console.log(`✓ Successfully created ${created} test notes in ${testFolder}`);
}

// Configuration
const vaultPath = '/Users/username/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault';
const noteCount = 10000;
const paragraphsPerNote = 10;

// Run
generateNotes(vaultPath, noteCount, paragraphsPerNote)
    .then(() => console.log('Done!'))
    .catch(err => console.error('Error:', err));
