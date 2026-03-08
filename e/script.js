// --- GLOBAL STATE ---
let currentTab = 'text'; // 'text' or 'board'
let currentTextId = null;
let currentBoardId = null;
let isCodeMode = false;
let zIndexCounter = 10;

// --- DOM ELEMENTS ---
const tabText = document.getElementById('tabText');
const tabBoard = document.getElementById('tabBoard');
const textView = document.getElementById('textView');
const boardView = document.getElementById('boardView');
const toggleCodeBtn = document.getElementById('toggleCodeBtn');
const saveBtn = document.getElementById('saveBtn');
const filesBtn = document.getElementById('filesBtn');
const fileDropdown = document.getElementById('fileDropdown');
const fileList = document.getElementById('fileList');
const newFileBtn = document.getElementById('newFileBtn');

// Text Elements
const mainEditor = document.getElementById('mainEditor');
const textStats = document.getElementById('textStats');
const editorWrapper = document.getElementById('editorWrapper');
const lineNumbers = document.getElementById('lineNumbers');
const codeHighlight = document.getElementById('codeHighlight');

// Board Elements
const boardViewport = document.getElementById('boardViewport');
const boardCanvas = document.getElementById('boardCanvas');

// --- INITIALIZATION ---
window.onload = () => { 
    renderFileList(); 
    // Start canvas at 0,0 upper left
    boardViewport.scrollLeft = 0;
    boardViewport.scrollTop = 0;
};

// --- NAVIGATION ---
tabText.addEventListener('click', () => {
    currentTab = 'text';
    tabText.classList.add('active'); tabBoard.classList.remove('active');
    textView.classList.add('active'); boardView.classList.remove('active');
    toggleCodeBtn.style.display = 'flex'; // Show code toggle
    renderFileList();
});

tabBoard.addEventListener('click', () => {
    currentTab = 'board';
    tabBoard.classList.add('active'); tabText.classList.remove('active');
    boardView.classList.add('active'); textView.classList.remove('active');
    toggleCodeBtn.style.display = 'none'; // Hide code toggle
    renderFileList();
});

function formatDate(ms) {
    const d = new Date(parseInt(ms));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
}

// --- DUAL FILE SYSTEM ---
function renderFileList() {
    fileList.innerHTML = '';
    if (currentTab === 'text') {
        const files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
        files.sort((a,b) => b.lastSaved - a.lastSaved).forEach(file => {
            const li = document.createElement('li');
            const title = file.content.split('\n')[0].trim() || 'Untitled';
            li.innerHTML = `<span class="file-title">${title}</span> <span class="file-date">${formatDate(file.lastSaved)}</span>`;
            li.onclick = () => { openTextFile(file.id); fileDropdown.classList.remove('open'); };
            fileList.appendChild(li);
        });
    } else {
        const boards = JSON.parse(localStorage.getItem('appBoardFiles')) || [];
        boards.sort((a,b) => b.lastSaved - a.lastSaved).forEach(board => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="file-title">${board.title}</span> <span class="file-date">${formatDate(board.lastSaved)}</span>`;
            li.onclick = () => { openBoardFile(board.id); fileDropdown.classList.remove('open'); };
            fileList.appendChild(li);
        });
    }
}

filesBtn.addEventListener('click', () => fileDropdown.classList.toggle('open'));

newFileBtn.addEventListener('click', () => {
    if (currentTab === 'text') {
        currentTextId = null; mainEditor.value = '';
        updateStats(); updateLineNumbersAndCode();
    } else {
        currentBoardId = null;
        boardCanvas.innerHTML = ''; // Clear canvas
    }
    fileDropdown.classList.remove('open');
});

saveBtn.addEventListener('click', () => {
    if (currentTab === 'text') saveTextFile(true);
    else saveBoardFile(true);
});

function triggerSaveAnimation() {
    saveBtn.style.backgroundColor = "#d4edda";
    setTimeout(() => saveBtn.style.backgroundColor = "transparent", 800);
}

// --- TEXT EDITOR LOGIC ---
function updateStats() {
    const text = mainEditor.value;
    const chars = text.length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    textStats.textContent = `${words} words | ${chars} chars`;
}

function updateLineNumbersAndCode() {
    const lines = mainEditor.value.split('\n');
    lineNumbers.innerHTML = lines.map((_, i) => i + 1).join('<br>');
    if (isCodeMode) {
        let text = mainEditor.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if(text[text.length-1] === '\n') text += ' '; 
        codeHighlight.innerHTML = text;
        Prism.highlightElement(codeHighlight);
    }
}

mainEditor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = mainEditor.scrollTop;
    document.querySelector('.code-overlay').scrollTop = mainEditor.scrollTop;
    document.querySelector('.code-overlay').scrollLeft = mainEditor.scrollLeft;
});

mainEditor.addEventListener('input', () => {
    updateStats(); updateLineNumbersAndCode();
    saveTextFile(false); // Auto-save
});

toggleCodeBtn.addEventListener('click', () => {
    isCodeMode = !isCodeMode;
    editorWrapper.classList.toggle('code-mode');
    toggleCodeBtn.style.background = isCodeMode ? '#e0e0e0' : 'none';
    updateLineNumbersAndCode();
});

function saveTextFile(visualFeedback = false) {
    const content = mainEditor.value;
    if (!content.trim() && !currentTextId) return;
    let files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
    
    if (currentTextId) {
        const idx = files.findIndex(f => f.id === currentTextId);
        if (idx > -1) { files[idx].content = content; files[idx].lastSaved = Date.now(); }
    } else {
        currentTextId = Date.now().toString();
        files.push({ id: currentTextId, content: content, lastSaved: Date.now() });
    }
    localStorage.setItem('appTextFiles', JSON.stringify(files));
    if (visualFeedback) triggerSaveAnimation();
    renderFileList();
}

function openTextFile(id) {
    const files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
    const file = files.find(f => f.id === id);
    if (file) {
        currentTextId = file.id; mainEditor.value = file.content;
        updateStats(); updateLineNumbersAndCode();
    }
}
// --- BOARD LOGIC & PERSISTENCE ---

let isPanning = false, startPanX, startPanY, scrollLeft, scrollTop;
boardViewport.addEventListener('mousedown', (e) => {
    if (e.target === boardViewport || e.target === boardCanvas) {
        isPanning = true; startPanX = e.pageX; startPanY = e.pageY;
        scrollLeft = boardViewport.scrollLeft; scrollTop = boardViewport.scrollTop;
        boardViewport.style.cursor = 'grabbing';
    }
});
window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    boardViewport.scrollLeft = scrollLeft - (e.pageX - startPanX);
    boardViewport.scrollTop = scrollTop - (e.pageY - startPanY);
});
window.addEventListener('mouseup', () => {
    isPanning = false; boardViewport.style.cursor = 'default';
});

function getSpawnCoords() {
    return {
        x: boardViewport.scrollLeft + 50,
        y: boardViewport.scrollTop + 50
    };
}

function extractBoardTitle(elementsData) {
    const firstNote = elementsData.find(e => e.type === 'note');
    if (firstNote && firstNote.text.trim()) {
        return firstNote.text.trim().substring(0, 15) + '...';
    }
    return 'Untitled Board';
}

function saveBoardFile(visualFeedback = false) {
    const elements = document.querySelectorAll('.draggable');
    if (elements.length === 0 && !currentBoardId) return; // Don't save completely empty new boards

    const elementsData = [];
    elements.forEach(el => {
        const type = el.dataset.type;
        const data = { type: type, left: el.style.left, top: el.style.top, zIndex: el.style.zIndex, width: el.style.width, height: el.style.height };
        
        if (type === 'note') {
            const textarea = el.querySelector('.note-body');
            data.bgColor = el.style.backgroundColor;
            data.text = textarea.value;
            data.width = textarea.style.width; data.height = textarea.style.height;
        } else if (type === 'table') {
            data.html = el.querySelector('.board-table').innerHTML;
        } else if (type === 'sketch') {
            data.image = el.querySelector('canvas').toDataURL();
        } else if (type === 'image') {
            data.imgSrc = el.querySelector('img').src;
        }
        elementsData.push(data);
    });

    let boards = JSON.parse(localStorage.getItem('appBoardFiles')) || [];
    
    if (currentBoardId) {
        const idx = boards.findIndex(b => b.id === currentBoardId);
        if (idx > -1) {
            boards[idx].elements = elementsData;
            boards[idx].lastSaved = Date.now();
            boards[idx].title = extractBoardTitle(elementsData);
        }
    } else {
        currentBoardId = Date.now().toString();
        boards.push({ 
            id: currentBoardId, 
            title: extractBoardTitle(elementsData),
            elements: elementsData, 
            lastSaved: Date.now() 
        });
    }

    try {
        localStorage.setItem('appBoardFiles', JSON.stringify(boards));
        if (visualFeedback) triggerSaveAnimation();
        renderFileList(); // Update sidebar names dynamically
    } catch(e) {
        console.warn("Storage full! Couldn't save board state.");
    }
}

function openBoardFile(id) {
    const boards = JSON.parse(localStorage.getItem('appBoardFiles')) || [];
    const board = boards.find(b => b.id === id);
    if (board) {
        currentBoardId = board.id;
        boardCanvas.innerHTML = ''; // Clear current
        zIndexCounter = 10; // Reset Z-index
        
        board.elements.forEach(data => {
            if (data.zIndex && parseInt(data.zIndex) > zIndexCounter) zIndexCounter = parseInt(data.zIndex);
            if (data.type === 'note') createNote(data);
            else if (data.type === 'table') createTable(data);
            else if (data.type === 'sketch') createSketch(data);
            else if (data.type === 'image') createImageWidget(data);
        });
    }
}

function makeDraggable(element, handle) {
    let isDragging = false, startX, startY, initialLeft, initialTop;
    element.addEventListener('pointerdown', () => {
        zIndexCounter++; element.style.zIndex = zIndexCounter; saveBoardFile();
    });
    handle.addEventListener('pointerdown', (e) => {
        if(['BUTTON', 'DIV', 'SPAN'].includes(e.target.tagName) && e.target !== handle) return; 
        isDragging = true; startX = e.clientX; startY = e.clientY;
        initialLeft = element.offsetLeft; initialTop = element.offsetTop;
        handle.setPointerCapture(e.pointerId); e.stopPropagation(); 
    });
    handle.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        element.style.left = `${initialLeft + (e.clientX - startX)}px`;
        element.style.top = `${initialTop + (e.clientY - startY)}px`;
    });
    handle.addEventListener('pointerup', (e) => {
        if (isDragging) { isDragging = false; handle.releasePointerCapture(e.pointerId); saveBoardFile(); }
    });
}
// --- ELEMENT CREATORS ---
const colors = ['#fff9c4', '#ffcdd2', '#c8e6c9', '#bbdefb', '#e1bee7'];

function createNote(data = null) {
    const pos = data ? { x: parseInt(data.left), y: parseInt(data.top) } : getSpawnCoords();
    const currentColor = data ? data.bgColor : colors[0];
    
    const note = document.createElement('div');
    note.className = 'draggable'; note.dataset.type = 'note';
    note.style.left = `${pos.x}px`; note.style.top = `${pos.y}px`;
    if (data && data.zIndex) note.style.zIndex = data.zIndex;
    note.style.backgroundColor = currentColor;

    note.innerHTML = `
        <div class="drag-handle">
            <div class="palette-btn" style="background-color: ${currentColor};"></div>
            <div class="color-dropdown">
                ${colors.map(c => `<div class="dot" style="background:${c}" data-color="${c}"></div>`).join('')}
            </div>
            <button class="close-btn">✕</button>
        </div>
        <textarea class="note-body" placeholder="Write here..." style="background:transparent;"></textarea>
    `;
    boardCanvas.appendChild(note);
    makeDraggable(note, note.querySelector('.drag-handle'));

    const textarea = note.querySelector('.note-body');
    if (data) {
        textarea.value = data.text || '';
        if (data.width) textarea.style.width = data.width;
        if (data.height) textarea.style.height = data.height;
    }

    const paletteBtn = note.querySelector('.palette-btn');
    const colorDropdown = note.querySelector('.color-dropdown');
    paletteBtn.addEventListener('click', () => colorDropdown.classList.toggle('show'));
    
    note.querySelectorAll('.dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            const chosenColor = e.target.dataset.color;
            note.style.backgroundColor = chosenColor;
            paletteBtn.style.backgroundColor = chosenColor;
            colorDropdown.classList.remove('show');
            saveBoardFile();
        });
    });

    textarea.addEventListener('input', () => saveBoardFile());
    textarea.addEventListener('mouseup', () => saveBoardFile());
    note.querySelector('.close-btn').addEventListener('click', () => { note.remove(); saveBoardFile(); });
    if (!data) saveBoardFile();
}

function createTable(data = null) {
    const pos = data ? { x: parseInt(data.left), y: parseInt(data.top) } : getSpawnCoords();
    const container = document.createElement('div');
    container.className = 'draggable table-widget'; container.dataset.type = 'table';
    container.style.left = `${pos.x}px`; container.style.top = `${pos.y}px`;
    if (data && data.zIndex) container.style.zIndex = data.zIndex;
    if (data && data.width) container.style.width = data.width;
    if (data && data.height) container.style.height = data.height;

    const defaultHTML = `
        <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
        <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
        <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
    `;

    container.innerHTML = `
        <div class="drag-handle">
            <div class="table-controls">
                <button class="add-col">+ Col</button>
                <button class="del-col">- Col</button>
            </div>
            <button class="close-btn">✕</button>
        </div>
        <table class="board-table">${data ? data.html : defaultHTML}</table>
    `;
    boardCanvas.appendChild(container);
    makeDraggable(container, container.querySelector('.drag-handle'));

    const table = container.querySelector('.board-table');
    container.querySelector('.add-col').addEventListener('click', () => {
        table.querySelectorAll('tr').forEach(row => {
            const td = document.createElement('td');
            td.contentEditable = "true";
            row.appendChild(td);
        });
        saveBoardFile();
    });

    container.querySelector('.del-col').addEventListener('click', () => {
        table.querySelectorAll('tr').forEach(row => {
            if (row.children.length > 1) row.lastElementChild.remove();
        });
        saveBoardFile();
    });

    const resizeObserver = new MutationObserver(() => saveBoardFile());
    resizeObserver.observe(container, { attributes: true, attributeFilter: ['style'] });

    table.addEventListener('input', () => saveBoardFile());
    container.querySelector('.close-btn').addEventListener('click', () => { container.remove(); saveBoardFile(); });
    if (!data) saveBoardFile();
}

function createSketch(data = null) {
    const pos = data ? { x: parseInt(data.left), y: parseInt(data.top) } : getSpawnCoords();
    const container = document.createElement('div');
    container.className = 'draggable sketch-widget'; container.dataset.type = 'sketch';
    container.style.left = `${pos.x}px`; container.style.top = `${pos.y}px`;
    if (data && data.zIndex) container.style.zIndex = data.zIndex;
    
    if (data && data.width) container.style.width = data.width;
    if (data && data.height) container.style.height = data.height;

    container.innerHTML = `
        <div class="drag-handle"><span style="font-size:12px; margin-left:5px; font-weight:bold;">Sketch</span><button class="close-btn">✕</button></div>
        <canvas class="drawing-canvas" width="1000" height="1000"></canvas>
    `;
    boardCanvas.appendChild(container);
    makeDraggable(container, container.querySelector('.drag-handle'));

    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;

    if (data && data.image) {
        const img = new Image(); img.src = data.image;
        img.onload = () => ctx.drawImage(img, 0, 0);
    }

    let isDrawing = false;
    
    function startDraw(e) { 
        isDrawing = true; 
        const rect = canvas.getBoundingClientRect(); 
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        ctx.beginPath(); 
        ctx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY); 
    }
    function draw(e) { 
        if (!isDrawing) return; 
        const rect = canvas.getBoundingClientRect(); 
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY); 
        ctx.stroke(); 
    }
    function stopDraw() { if (isDrawing) { isDrawing = false; saveBoardFile(); } }

    canvas.addEventListener('pointerdown', (e) => { e.stopPropagation(); startDraw(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { e.stopPropagation(); draw(e); });
    canvas.addEventListener('pointerup', (e) => { stopDraw(); canvas.releasePointerCapture(e.pointerId); });

    const resizeObserver = new MutationObserver(() => saveBoardFile());
    resizeObserver.observe(container, { attributes: true, attributeFilter: ['style'] });

    container.querySelector('.close-btn').addEventListener('click', () => { container.remove(); saveBoardFile(); });
    if (!data) saveBoardFile();
}

// IMAGE PASTING LOGIC
function createImageWidget(data) {
    const pos = data.left ? { x: parseInt(data.left), y: parseInt(data.top) } : getSpawnCoords();
    const container = document.createElement('div');
    container.className = 'draggable image-widget';
    container.dataset.type = 'image';
    container.style.left = `${pos.x}px`; container.style.top = `${pos.y}px`;
    if (data.zIndex) container.style.zIndex = data.zIndex;
    if (data.width) container.style.width = data.width;
    if (data.height) container.style.height = data.height;

    container.innerHTML = `
        <div class="drag-handle"><button class="close-btn">✕</button></div>
        <img src="${data.imgSrc}" />
    `;
    boardCanvas.appendChild(container);
    makeDraggable(container, container.querySelector('.drag-handle'));

    const resizeObserver = new MutationObserver(() => saveBoardFile());
    resizeObserver.observe(container, { attributes: true, attributeFilter: ['style'] });

    container.querySelector('.close-btn').addEventListener('click', () => { container.remove(); saveBoardFile(); });
    if (!data.left) saveBoardFile();
}

document.addEventListener('paste', (e) => {
    if (currentTab !== 'board') return; 

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.includes('image/')) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    let width = img.width; let height = img.height;
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6); 
                    createImageWidget({ imgSrc: compressedDataUrl });
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(blob);
        }
    }
});

document.getElementById('addNoteBtn').addEventListener('click', () => createNote());
document.getElementById('addTableBtn').addEventListener('click', () => createTable());
document.getElementById('addDrawBtn').addEventListener('click', () => createSketch());
