const DROPBOX_CSV_URL = "https://www.dropbox.com/scl/fi/jjna8gtwx3n1wj5obev5e/segment_data_example.csv?rlkey=zd69ad0c5vti8y6dke7puel2b&st=5pndf91u&raw=1";

const annotationTypes = [
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


const textContainer = document.getElementById('text-container');
const exportBtn = document.getElementById('export-btn');
const outputConsole = document.getElementById('output-console');
const annotationContainer = document.getElementById('annotation-container');
const segmentsList = document.getElementById('segments-list');
const reviewBtn = document.getElementById('review-btn');
const backBtn = document.getElementById('back-btn');
const submitBtn = document.getElementById('submit-btn');
const problemsDropdown = document.getElementById('problems-dropdown');

const clearBtn = document.getElementById('clear-btn')

let wordsArray = [];
let cuts = new Set();
const saved = localStorage.getItem('localCuts');
if (saved) {
    cuts = new Set(JSON.parse(saved));
}

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
    outputConsole.innerText = "Loading agreement data from Dropbox...";
    outputConsole.style.color = "#3b82f6";

    try {
        const response = await fetch(DROPBOX_CSV_URL);
        if (!response.ok) throw new Error("Failed to load Dropbox file.");
        
        const csvData = await response.text();
        const lines = csvData.split('\n');
        
        if (lines.length > 1) {
            const rowData = parseCSVRow(lines[1]);
            const documentText = rowData[1] || rowData[0] || "";
            
            wordsArray = documentText.split(/\s+/).filter(word => word.length > 0);
            
            const saved = localStorage.getItem('localCuts');
            if (saved) {
                cuts = new Set(JSON.parse(saved));
            }

            outputConsole.innerText = "Document loaded successfully!";
            outputConsole.style.color = "#22c55e";
            renderText();
        }
    } catch (error) {
        console.error(error);
        outputConsole.innerText = "Error fetching Dropbox data. Check browser console.";
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


const coderBCuts = [9, 21, 31]; 

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

exportBtn.addEventListener('click', () => {
    const coderACuts = Array.from(cuts).sort((a, b) => a - b);
    
    if (coderACuts.length === 0) {
        outputConsole.innerText = "Please make at least one cut before grading!";
        outputConsole.style.color = "#ef4444"; 
        return;
    }


    const sharedCuts = coderACuts.filter(cut => coderBCuts.includes(cut));
    

    const allUniqueCuts = new Set([...coderACuts, ...coderBCuts]);
    

    const agreementScore = (sharedCuts.length / allUniqueCuts.size) * 100;

    if (agreementScore >= 80) {
        outputConsole.style.color = "#22c55e"; 
        outputConsole.innerText = `PASS: ${agreementScore.toFixed(1)}% Agreement!\nYour Cuts: [${coderACuts}]\nCoder B Cuts: [${coderBCuts}]`;
    } else {
        outputConsole.style.color = "#ef4444"; 
        outputConsole.innerText = `FAIL: ${agreementScore.toFixed(1)}% Agreement. Potential segmentation error.\nYour Cuts: [${coderACuts}]\nCoder B Cuts: [${coderBCuts}]`;
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

document.getElementById('clear-btn').addEventListener('click', () => {
    if (confirm("Are you sure you want to delete all cuts?")) {
        cuts.clear();
        localStorage.removeItem('localCuts');
        renderText();
        outputConsole.innerText = "All cuts cleared.";
        outputConsole.style.color = "#38bdf8";
    }
});

problemsEncountered.forEach(problem => {
    const option = document.createElement('option');
    option.value = problem;
    option.innerText = problem;
    problemsDropdown.appendChild(option);
});

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

submitBtn.addEventListener('click', () => {
    const dropdowns = document.querySelectorAll('.segment-annotation');
    let chosenCategories = [];
    let isMissingAnnotation = false;

    dropdowns.forEach((dropdown) => {
        if (dropdown.value === "Select a category..." || dropdown.value === annotationTypes[0]) {
            isMissingAnnotation = true;
        }
        chosenCategories.push(dropdown.value);
    });

    if (isMissingAnnotation) {
        alert("Please select an annotation category for every segment.");
        return;
    }

    const finalProblem = problemsDropdown.value;
    
    console.log("FINAL SUBMISSION PAYLOAD:", {
        cutsArray: Array.from(cuts).sort((a, b) => a - b),
        annotations: chosenCategories,
        problemFlag: finalProblem
    });

    alert("Check browser console (F12) to see your submitted payload!");
});

loadDropboxData();