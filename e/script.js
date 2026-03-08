const tabText = document.getElementById('tabText');
const tabBoard = document.getElementById('tabBoard');
const textView = document.getElementById('textView');
const boardView = document.getElementById('boardView');
const textControls = document.getElementById('textControls');

tabText.addEventListener('click', () => {
    tabText.classList.add('active'); tabBoard.classList.remove('active');
    textView.classList.add('active'); boardView.classList.remove('active');
    textControls.style.display = 'flex';
});

tabBoard.addEventListener('click', () => {
    tabBoard.classList.add('active'); tabText.classList.remove('active');
    boardView.classList.add('active'); textView.classList.remove('active');
    textControls.style.display = 'none';
    setTimeout(centerBoard, 10);
});

const mainEditor = document.getElementById('mainEditor');
const textStats = document.getElementById('textStats');
const saveBtn = document.getElementById('saveBtn');
const filesBtn = document.getElementById('filesBtn');
const fileDropdown = document.getElementById('fileDropdown');
const fileList = document.getElementById('fileList');
const newFileBtn = document.getElementById('newFileBtn');
const toggleCodeBtn = document.getElementById('toggleCodeBtn');
const editorWrapper = document.getElementById('editorWrapper');
const lineNumbers = document.getElementById('lineNumbers');
const codeHighlight = document.getElementById('codeHighlight');

let currentFileId = null;
let isCodeMode = false;

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
    updateStats();
    updateLineNumbersAndCode();
});

toggleCodeBtn.addEventListener('click', () => {
    isCodeMode = !isCodeMode;
    editorWrapper.classList.toggle('code-mode');
    toggleCodeBtn.style.background = isCodeMode ? '#e0e0e0' : 'none';
    updateLineNumbersAndCode();
});

function formatDate(ms) {
    const d = new Date(parseInt(ms));
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
}

function loadFiles() {
    const files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
    fileList.innerHTML = '';
    files.sort((a,b) => b.lastSaved - a.lastSaved).forEach(file => {
        const li = document.createElement('li');
        const title = file.content.split('\n')[0].trim() || 'Untitled';
        li.innerHTML = `<span class="file-title">${title}</span> <span class="file-date">${formatDate(file.lastSaved)}</span>`;
        li.onclick = () => { openFile(file.id); fileDropdown.classList.remove('open'); };
        fileList.appendChild(li);
    });
}

function saveFile() {
    const content = mainEditor.value;
    if (!content.trim() && !currentFileId) return;
    let files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
    
    if (currentFileId) {
        const idx = files.findIndex(f => f.id === currentFileId);
        if (idx > -1) {
            files[idx].content = content;
            files[idx].lastSaved = Date.now();
        }
    } else {
        currentFileId = Date.now().toString();
        files.push({ id: currentFileId, content: content, lastSaved: Date.now() });
    }
    
    localStorage.setItem('appTextFiles', JSON.stringify(files));
    saveBtn.textContent = "Saved!";
    setTimeout(() => saveBtn.textContent = "Save", 1000);
    loadFiles();
}

function openFile(id) {
    const files = JSON.parse(localStorage.getItem('appTextFiles')) || [];
    const file = files.find(f => f.id === id);
    if (file) {
        currentFileId = file.id; mainEditor.value = file.content;
        updateStats(); updateLineNumbersAndCode();
    }
}

filesBtn.addEventListener('click', () => fileDropdown.classList.toggle('open'));
newFileBtn.addEventListener('click', () => {
    currentFileId = null; mainEditor.value = '';
    updateStats(); updateLineNumbersAndCode(); fileDropdown.classList.remove('open');
});

saveBtn.addEventListener('click', saveFile);

const boardViewport = document.getElementById('boardViewport');
const boardCanvas = document.getElementById('boardCanvas');
let zIndexCounter = 10;
let boardCentered = false;

function centerBoard() {
    if(!boardCentered && boardViewport.clientWidth > 0) {
        boardViewport.scrollLeft = 2500 - (boardViewport.clientWidth / 2);
        boardViewport.scrollTop = 2500 - (boardViewport.clientHeight / 2);
        boardCentered = true;
    }
}

window.onload = () => { loadFiles(); };

let isPanning = false, startPanX, startPanY, scrollLeft, scrollTop;
boardViewport.addEventListener('mousedown', (e) => {
    if (e.target === boardViewport || e.target === boardCanvas) {
        isPanning = true;
        startPanX = e.pageX; startPanY = e.pageY;
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
        x: boardViewport.scrollLeft + (boardViewport.clientWidth / 2) - 100,
        y: boardViewport.scrollTop + (boardViewport.clientHeight / 2) - 100
    };
}

function makeDraggable(element, handle) {
    let isDragging = false, startX, startY, initialLeft, initialTop;
    
    element.addEventListener('pointerdown', () => {
        zIndexCounter++; element.style.zIndex = zIndexCounter;
    });

    handle.addEventListener('pointerdown', (e) => {
        if(e.target.classList.contains('close-btn') || e.target.classList.contains('dot')) return;
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        initialLeft = element.offsetLeft; initialTop = element.offsetTop;
        handle.setPointerCapture(e.pointerId);
        e.stopPropagation(); 
    });

    handle.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        element.style.left = `${initialLeft + (e.clientX - startX)}px`;
        element.style.top = `${initialTop + (e.clientY - startY)}px`;
    });

    handle.addEventListener('pointerup', (e) => {
        isDragging = false; handle.releasePointerCapture(e.pointerId);
    });
}

const colors = ['#fff9c4', '#ffcdd2', '#c8e6c9', '#bbdefb', '#e1bee7'];
document.getElementById('addNoteBtn').addEventListener('click', () => {
    const pos = getSpawnCoords();
    const note = document.createElement('div');
    note.className = 'draggable';
    note.style.left = `${pos.x}px`;
    note.style.top = `${pos.y}px`;
    note.style.backgroundColor = colors[0];

    note.innerHTML = `
        <div class="drag-handle">
            <div class="color-dots">
                ${colors.map(c => `<div class="dot" style="background:${c}" data-color="${c}"></div>`).join('')}
            </div>
            <button class="close-btn">✕</button>
        </div>
        <textarea class="note-body" placeholder="Write here..." style="background:transparent;"></textarea>
    `;
    boardCanvas.appendChild(note);
    makeDraggable(note, note.querySelector('.drag-handle'));

    note.querySelector('.close-btn').addEventListener('click', () => note.remove());
    note.querySelectorAll('.dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            note.style.backgroundColor = e.target.dataset.color;
        });
    });
});

document.getElementById('addTableBtn').addEventListener('click', () => {
    const pos = getSpawnCoords();
    const container = document.createElement('div');
    container.className = 'draggable';
    container.style.left = `${pos.x}px`;
    container.style.top = `${pos.y}px`;
    container.innerHTML = `
        <div class="drag-handle"><span style="font-size:12px; margin-left:5px; font-weight:bold;">Table</span><button class="close-btn">✕</button></div>
        <table class="board-table">
            <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
            <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
            <tr><td contenteditable="true"></td><td contenteditable="true"></td><td contenteditable="true"></td></tr>
        </table>
    `;
    boardCanvas.appendChild(container);
    makeDraggable(container, container.querySelector('.drag-handle'));
    container.querySelector('.close-btn').addEventListener('click', () => container.remove());
});

document.getElementById('addDrawBtn').addEventListener('click', () => {
    const pos = getSpawnCoords();
    const container = document.createElement('div');
    container.className = 'draggable';
    container.style.left = `${pos.x}px`;
    container.style.top = `${pos.y}px`;
    container.innerHTML = `
        <div class="drag-handle"><span style="font-size:12px; margin-left:5px; font-weight:bold;">Sketch</span><button class="close-btn">✕</button></div>
        <canvas class="drawing-canvas" width="250" height="250"></canvas>
    `;
    boardCanvas.appendChild(container);
    makeDraggable(container, container.querySelector('.drag-handle'));
    container.querySelector('.close-btn').addEventListener('click', () => container.remove());

    const canvas = container.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;

    function startDraw(e) {
        isDrawing = true;
        const rect = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    }
    function draw(e) {
        if (!isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    }
    function stopDraw() { isDrawing = false; }

    canvas.addEventListener('pointerdown', (e) => { e.stopPropagation(); startDraw(e); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { e.stopPropagation(); draw(e); });
    canvas.addEventListener('pointerup', (e) => { stopDraw(); canvas.releasePointerCapture(e.pointerId); });
});
