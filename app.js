// ==========================================
// CONFIGURATION & API KEYS
// ==========================================

const DROPBOX_CSV_URL = "https://www.dropbox.com/scl/fi/jjna8gtwx3n1wj5obev5e/segment_data_example.csv?rlkey=zd69ad0c5vti8y6dke7puel2b&st=5pndf91u&raw=1";
const DROPBOX_ACCESS_TOKEN = "YOUR_DROPBOX_ACCESS_TOKEN_HERE";

// Files stored in Dropbox
const DROPBOX_CSV_SAVE_PATH = "/annotations.csv";
const DROPBOX_REFERENCE_CUTS_PATH = "/reference_cuts.json";

const CURRENT_USER = "woojo";
const DOCUMENT_TITLE = "segment_data_example";

// ==========================================
// CONSTANTS & ANNOTATION TYPES
// ==========================================

const annotationTypes = [
    "Select a category...",
    "Motivation/Preamble",
    "Obligation (to Other States)",
    "Exceptions / Rights",
    "Definitions / Scope",
    "Data/Info Exchange",
    "Verifying Compliance",
    "Process - Entry in Force",
    "Process - Disputes/Courts",
    "Process - Amendments/Mods",
    "Process - Right to Withdraw",
    "Process - Expiration/Terminate",
    "Process - Renewals",
    "Administrative - Table of Contents",
    "Administrative - Definitions",
    "Administrative - Tables/Maps",
    "Administrative - Measures/Specs",
    "Administrative - Financial",
    "Administrative - Signature/End",
    "Administrative - Other",
    "NONBINDING INSTRUMENTS (letters/statements/negotiations)",
    "[START OF SECTION/CHAPTER (title)]",
    "[START ANNEX/SCHEDULE/ATTACHMENT (title)]",
    "[START ENTIRELY NEW DOCUMENT (title)]",
    "ACCIDENTAL CLICK (DELETE)",
    "Other - None of Above"
];

const problemsEncountered = [
    "None",
    "Text incomplete",
    "Text rendered improperly",
    "Text is in a different language",
    "Confused about segmentation",
    "Contains an annex",
    "Is an annex (annex only)",
    "Contained more than one document/annex",
    "Probably not a binding agreement",
    "Other"
];

// ==========================================
// DOM ELEMENTS
// ==========================================

const textContainer = document.getElementById('text-container');
const exportBtn = document.getElementById('export-btn');
const outputConsole = document.getElementById('output-console');
const annotationContainer = document.getElementById('annotation-container');
const segmentsList = document.getElementById('segments-list');
const reviewBtn = document.getElementById('review-btn');
const backBtn = document.getElementById('back-btn');
const submitBtn = document.getElementById('submit-btn');
const problemsDropdown = document.getElementById('problems-dropdown');
const clearBtn = document.getElementById('clear-btn');

// ==========================================
// APPLICATION STATE
// ==========================================

let wordsArray = [];
let cuts = new Set();
let referenceCuts = null; // Will store Coder 1's baseline cuts if available

const saved = localStorage.getItem('localCuts');
if (saved) {
    cuts = new Set(JSON.parse(saved));
}

// ==========================================
// DROPBOX HELPER FUNCTIONS
// ==========================================

function escapeCSV(val) {
    if (val === null || val === undefined) return '""';
    let str = String(val).replace(/"/g, '""');
    return `"${str}"`;
}

// Read JSON or Text files from Dropbox
async function fetchDropboxFile(path) {
    try {
        const response = await fetch("https://content.dropboxapi.com/2/files/download", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
                "Dropbox-API-Arg": JSON.stringify({ path: path })
            }
        });
        if (response.ok) {
            return await response.text();
        }
        return null;
    } catch (err) {
        console.warn(`File ${path} not found on Dropbox.`, err);
        return null;
    }
}

// Upload content to Dropbox
async function saveDropboxFile(path, content, contentType = "application/octet-stream") {
    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${DROPBOX_ACCESS_TOKEN}`,
            "Dropbox-API-Arg": JSON.stringify({
                path: path,
                mode: "overwrite",
                autorename: false,
                mute: false
            }),
            "Content-Type": contentType
        },
        body: content
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Dropbox upload failed: ${errText}`);
    }
    return await response.json();
}

// Load baseline cuts for this document from reference_cuts.json
async function loadReferenceCuts() {
    const jsonText = await fetchDropboxFile(DROPBOX_REFERENCE_CUTS_PATH);
    if (jsonText) {
        try {
            const allRefData = JSON.parse(jsonText);
            if (allRefData[DOCUMENT_TITLE]) {
                referenceCuts = allRefData[DOCUMENT_TITLE].cuts;
                console.log("Loaded baseline cuts for document:", referenceCuts);
            }
        } catch (e) {
            console.error("Error parsing reference cuts JSON:", e);
        }
    }
}

// ==========================================
// DATA FETCHING & RENDERING
// ==========================================

function parseCSVRow(csvText) {
    let result = [];
    let insideQuote = false;
    let entry = '';
    
    for (let i = 0; i < csvText.length; i++) {
        let char = csvText[i];
        if (char === '"') {
            insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
            result.push(entry.trim());
            entry = '';
        } else {
            entry += char;
        }
    }
    result.push(entry.trim());
    return result;
}

async function loadDropboxData() {
    outputConsole.innerText = "Loading agreement data & reference cuts...";
    outputConsole.style.color = "#3b82f6";

    try {
        // Fetch reference cuts in background
        await loadReferenceCuts();

        // Fetch document text
        const response = await fetch(DROPBOX_CSV_URL);
        if (!response.ok) throw new Error("Failed to load Dropbox file.");
        
        const csvData = await response.text();
        const lines = csvData.split('\n');
        
        if (lines.length > 1) {
            const rowData = parseCSVRow(lines[1]);
            const documentText = rowData[1] || rowData[0] || "";
            
            wordsArray = documentText.split(/\s+/).filter(word => word.length > 0);

            outputConsole.innerText = referenceCuts 
                ? "Document loaded! Baseline cuts exist for comparison."
                : "Document loaded! You are the first coder for this document.";
            outputConsole.style.color = "#22c55e";
            renderText();
        }
    } catch (error) {
        console.error(error);
        outputConsole.innerText = "Error fetching Dropbox data. Check console.";
        outputConsole.style.color = "#ef4444";
    }
}

function toggleCut(index) {
    if (cuts.has(index)) {
        cuts.delete(index); 
    } else {
        cuts.add(index); 
    }
    localStorage.setItem('localCuts', JSON.stringify(Array.from(cuts)));
    renderText(); 
}

function renderText() {
    textContainer.innerHTML = ""; 

    wordsArray.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.innerText = word + " ";
        
        if (cuts.has(index)) {
            wordSpan.classList.add('cut-after');
        }

        wordSpan.addEventListener('click', () => {
            toggleCut(index);
        });

        textContainer.appendChild(wordSpan);
    });
}

// ==========================================
// DYNAMIC GRADING & CLEAR CONTROLS
// ==========================================

exportBtn.addEventListener('click', async () => {
    const coderACuts = Array.from(cuts).sort((a, b) => a - b);
    
    if (coderACuts.length === 0) {
        outputConsole.innerText = "Please make at least one cut first!";
        outputConsole.style.color = "#ef4444"; 
        return;
    }

    // IF FIRST TIME (No reference cuts exist in Dropbox for this document)
    if (!referenceCuts) {
        outputConsole.innerText = "Saving your cuts as the baseline...\nWaiting for the document to be coded by another person.";
        outputConsole.style.color = "#eab308"; // yellow/warning tone

        try {
            // Load existing store or create new
            const jsonText = await fetchDropboxFile(DROPBOX_REFERENCE_CUTS_PATH);
            let refStore = jsonText ? JSON.parse(jsonText) : {};
            
            refStore[DOCUMENT_TITLE] = {
                coder: CURRENT_USER,
                timestamp: new Date().toISOString(),
                cuts: coderACuts
            };

            await saveDropboxFile(DROPBOX_REFERENCE_CUTS_PATH, JSON.stringify(refStore, null, 2), "application/json");
            referenceCuts = coderACuts; // Cache locally
            
            alert("Baseline cuts saved! Waiting for the document to be coded by another person.");
        } catch (err) {
            console.error("Failed to save baseline cuts:", err);
            outputConsole.innerText = "Error saving baseline cuts to Dropbox.";
            outputConsole.style.color = "#ef4444";
        }
        return;
    }

    // IF SECOND TIME ONWARDS (Compare against Coder 1's cuts)
    const sharedCuts = coderACuts.filter(cut => referenceCuts.includes(cut));
    const allUniqueCuts = new Set([...coderACuts, ...referenceCuts]);
    const agreementScore = (sharedCuts.length / allUniqueCuts.size) * 100;

    if (agreementScore >= 80) {
        outputConsole.style.color = "#22c55e"; 
        outputConsole.innerText = `PASS: ${agreementScore.toFixed(1)}% Agreement!\nYour Cuts: [${coderACuts}]\nCoder 1 Baseline Cuts: [${referenceCuts}]`;
    } else {
        outputConsole.style.color = "#ef4444"; 
        outputConsole.innerText = `FAIL: ${agreementScore.toFixed(1)}% Agreement. Potential segmentation error.\nYour Cuts: [${coderACuts}]\nCoder 1 Baseline Cuts: [${referenceCuts}]`;
    }
});

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to delete all cuts?")) {
            cuts.clear();
            localStorage.removeItem('localCuts');
            renderText();
            outputConsole.innerText = "All cuts cleared.";
            outputConsole.style.color = "#38bdf8";
        }
    });
}

problemsEncountered.forEach(problem => {
    const option = document.createElement('option');
    option.value = problem;
    option.innerText = problem;
    problemsDropdown.appendChild(option);
});

// ==========================================
// ANNOTATION VIEW & SUBMISSION
// ==========================================

reviewBtn.addEventListener('click', () => {
    textContainer.style.display = "none";
    reviewBtn.style.display = "none";
    if (clearBtn) clearBtn.style.display = "none";
    annotationContainer.style.display = "block";
    outputConsole.innerText = "";
    
    segmentsList.innerHTML = "";
    
    let segmentTexts = [];
    let currentSegment = [];
    
    wordsArray.forEach((word, index) => {
        currentSegment.push(word);
        if (cuts.has(index) || index === wordsArray.length - 1) {
            segmentTexts.push(currentSegment.join(" "));
            currentSegment = [];
        }
    });

    segmentTexts.forEach((text, i) => {
        const segmentBox = document.createElement('div');
        segmentBox.style.border = "1px solid #9ca3af";
        segmentBox.style.padding = "15px";
        segmentBox.style.marginBottom = "15px";
        segmentBox.style.borderRadius = "5px";
        segmentBox.style.backgroundColor = "#f9fafb";

        const segmentHeader = document.createElement('h4');
        segmentHeader.innerText = `Segment ${i + 1}`;
        segmentHeader.style.marginTop = "0";

        const textPara = document.createElement('p');
        textPara.innerText = text;

        const selectDropdown = document.createElement('select');
        selectDropdown.style.width = "100%";
        selectDropdown.style.padding = "8px";
        selectDropdown.className = "segment-annotation";
        
        annotationTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.innerText = type;
            selectDropdown.appendChild(option);
        });

        segmentBox.appendChild(segmentHeader);
        segmentBox.appendChild(textPara);
        segmentBox.appendChild(selectDropdown);
        segmentsList.appendChild(segmentBox);
    });
});

backBtn.addEventListener('click', () => {
    annotationContainer.style.display = "none";
    textContainer.style.display = "block";
    reviewBtn.style.display = "inline-block";
    if (clearBtn) clearBtn.style.display = "inline-block";
});

submitBtn.addEventListener('click', async () => {
    const dropdowns = document.querySelectorAll('.segment-annotation');
    let chosenCategories = [];
    let isMissingAnnotation = false;

    dropdowns.forEach((dropdown) => {
        if (dropdown.value === "Select a category...") {
            isMissingAnnotation = true;
        }
        chosenCategories.push(dropdown.value);
    });

    if (isMissingAnnotation) {
        alert("Please select an annotation category for every segment.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Saving to Dropbox...";

    try {
        let segmentTexts = [];
        let currentSegment = [];
        wordsArray.forEach((word, index) => {
            currentSegment.push(word);
            if (cuts.has(index) || index === wordsArray.length - 1) {
                segmentTexts.push(currentSegment.join(" "));
                currentSegment = [];
            }
        });

        const now = new Date();
        const timestamp = now.toISOString();
        const currentDate = now.toISOString().split('T')[0];
        const finalProblem = problemsDropdown.value;
        const codingString = `cut_${Array.from(cuts).sort((a, b) => a - b).join('_')}`;

        const headers = ["timestamp", "segid", "user", "coding", "segment_id", "segment", "annotation_type", "annotation_other", "title", "date"];
        
        let existingCSV = await fetchDropboxFile(DROPBOX_CSV_SAVE_PATH) || "";
        let csvRows = [];

        if (!existingCSV.trim()) {
            csvRows.push(headers.join("\t"));
        } else {
            csvRows.push(existingCSV.trim());
        }

        segmentTexts.forEach((segmentText, i) => {
            const annotationType = chosenCategories[i];
            const segId = `SEG-${i + 1}`;
            
            const rowValues = [
                timestamp,
                segId,
                CURRENT_USER,
                codingString,
                i + 1,
                segmentText,
                annotationType,
                finalProblem,
                DOCUMENT_TITLE,
                currentDate
            ];

            csvRows.push(rowValues.map(escapeCSV).join("\t"));
        });

        const fullCSVContent = csvRows.join("\n");
        await saveDropboxFile(DROPBOX_CSV_SAVE_PATH, fullCSVContent);

        outputConsole.innerText = "Successfully saved annotations to Dropbox!";
        outputConsole.style.color = "#22c55e";
        alert("Annotations saved to Dropbox successfully!");

    } catch (error) {
        console.error("Error saving annotations:", error);
        outputConsole.innerText = "Failed to save annotations to Dropbox.";
        outputConsole.style.color = "#ef4444";
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Final Annotations";
    }
});

// Initialize
loadDropboxData();