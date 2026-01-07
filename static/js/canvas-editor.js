// Canvas Editor для интерактивных заметок
class CanvasEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.isPanning = false;
        this.currentTool = 'select'; // select, pencil, node, line, arrow, text, zone, sticker, frame
        this.nodes = [];
        this.edges = [];
        this.drawings = []; // Массивы точек для рисования
        this.images = [];
        this.texts = []; // Текстовые объекты
        this.zones = []; // Зоны (задний план)
        this.stickers = []; // Стикеры Post-it
        this.frames = []; // Рамки-контейнеры
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedImage = null;
        this.selectedDrawing = null;
        this.selectedText = null;
        this.selectedZone = null;
        this.selectedSticker = null;
        this.selectedFrame = null;
        
        // Множественное выделение
        this.selectedObjects = []; // Массив {type: 'node'|'edge'|..., obj: object}
        this.isSelectionBox = false;
        this.selectionBoxStart = null;
        this.selectionBoxEnd = null;
        
        // Палитра цветов (загружается из localStorage)
        this.colorPalette = this.loadColorPalette();
        this.connectingFrom = null;
        this.connectingTo = null;
        this.panStart = { x: 0, y: 0 };
        this.panOffset = { x: 0, y: 0 };
        this.scale = 1;
        this.lastMousePos = { x: 0, y: 0 };
        this.dragOffset = { x: 0, y: 0 };
        this.dragOffsets = []; // Для множественного перемещения
        this.draggingControlPoint = false;
        this.resizingZone = null;
        this.resizeHandle = null; // 'nw', 'ne', 'sw', 'se'
        
        // Стили
        this.lineStyle = 'solid'; // solid, dashed, dotted, dashdot, wave
        this.arrowStyle = 'normal'; // normal, double, open, closed, diamond
        this.nodeShape = 'rectangle'; // rectangle, circle, ellipse, triangle, diamond, star, hexagon
        this.lineColor = '#5865f2';
        this.lineWidth = 2;
        this.fillColor = '#252525';
        this.strokeColor = '#5865f2';
        
        this.init();
    }
    
    init() {
        // Создаем canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'canvas-editor';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this.canvas.style.cursor = 'default';
        this.container.appendChild(this.canvas);
        
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        
        // Обработчики событий
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        window.addEventListener('resize', () => this.resize());
        
        // Предотвращаем контекстное меню
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        this.redraw();
    }
    
    resize() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.redraw();
    }
    
    screenToCanvas(x, y) {
        // Конвертируем экранные координаты в координаты canvas
        // После transform: x' = x * scale + panOffset.x
        // Обратная операция: x = (x' - panOffset.x) / scale
        return {
            x: (x - this.panOffset.x) / this.scale,
            y: (y - this.panOffset.y) / this.scale
        };
    }
    
    canvasToScreen(x, y) {
        return {
            x: x * this.scale + this.panOffset.x,
            y: y * this.scale + this.panOffset.y
        };
    }
    
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const canvasPos = this.screenToCanvas(x, y);
        
        this.lastMousePos = { x, y };
        this.panStart = { x, y };
        
        // Проверяем клик на чекбокс TODO
        if (this.currentTool === 'select') {
            const todoNode = this.getTodoCheckboxAt(canvasPos.x, canvasPos.y);
            if (todoNode) {
                todoNode.todo = !todoNode.todo;
                this.redraw();
                return;
            }
        }
        
        // Панорамирование правой кнопкой мыши или инструментом pan
        if (e.button === 2 || this.currentTool === 'pan') {
            // При pan tool проверяем клик на зону для изменения размера
            if (this.currentTool === 'pan' && e.button === 0) {
                // Проверяем ручки изменения размера зон
                const zoneHandle = this.getZoneResizeHandle(canvasPos.x, canvasPos.y);
                if (zoneHandle) {
                    this.resizingZone = zoneHandle.zone;
                    this.resizeHandle = zoneHandle.handle;
                    this.selectedZone = zoneHandle.zone;
                    this.canvas.style.cursor = this.getResizeCursor(zoneHandle.handle);
                    this.redraw();
                    return;
                }
                
                // Проверяем клик на зону для перемещения
                const zone = this.getZoneAt(canvasPos.x, canvasPos.y);
                if (zone) {
                    this.clearSelection();
                    this.selectedZone = zone;
                    this.dragOffset = {
                        x: canvasPos.x - zone.x,
                        y: canvasPos.y - zone.y
                    };
                    this.canvas.style.cursor = 'move';
                    this.redraw();
                    return;
                }
            }
            
            this.isPanning = true;
            this.canvas.style.cursor = 'move';
            return;
        }
        
        if (this.currentTool === 'pencil') {
            this.isDrawing = true;
            const drawingId = 'drawing_' + Date.now();
            this.drawings.push({
                id: drawingId,
                points: [{ x: canvasPos.x, y: canvasPos.y }],
                color: this.lineColor,
                width: this.lineWidth
            });
            this.selectedDrawing = this.drawings[this.drawings.length - 1];
            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedImage = null;
        } else if (this.currentTool === 'node') {
            // Создаем новый блок
            const nodeId = 'node_' + Date.now();
            const newNode = {
                id: nodeId,
                x: canvasPos.x - 60,
                y: canvasPos.y - 30,
                width: 120,
                height: 60,
                text: 'Блок',
                shape: this.nodeShape,
                fillColor: this.fillColor,
                strokeColor: this.strokeColor,
                strokeWidth: 2
                // todo будет undefined до тех пор, пока не будет добавлен через кнопку TODO
            };
            this.nodes.push(newNode);
            this.selectedNode = newNode;
            this.selectedEdge = null;
            this.selectedImage = null;
            this.selectedDrawing = null;
            this.updateNodeSize(newNode);
            this.updateTodoButtonVisibility();
            this.redraw();
        } else if (this.currentTool === 'line' || this.currentTool === 'arrow' || this.currentTool === 'curved-arrow') {
            // Выбираем любой объект для соединения
            const target = this.getAnyObjectAt(canvasPos.x, canvasPos.y);
            if (target) {
                if (!this.connectingFrom) {
                    this.connectingFrom = target;
                    this.highlightConnecting(target);
                    this.redraw();
                } else if (target.obj !== this.connectingFrom.obj) {
                    this.connectingTo = target;
                    // Создаем соединение
                    const edgeId = 'edge_' + Date.now();
                    
                    // Для изогнутой стрелки добавляем контрольную точку
                    const isCurved = this.currentTool === 'curved-arrow';
                    const fromCenter = this.getObjectCenter(this.connectingFrom.type, this.connectingFrom.obj);
                    const toCenter = this.getObjectCenter(this.connectingTo.type, this.connectingTo.obj);
                    
                    const newEdge = {
                        id: edgeId,
                        fromType: this.connectingFrom.type,
                        from: this.connectingFrom.obj.id,
                        toType: this.connectingTo.type,
                        to: this.connectingTo.obj.id,
                        style: this.lineStyle,
                        arrowStyle: (this.currentTool === 'arrow' || this.currentTool === 'curved-arrow') ? this.arrowStyle : 'none',
                        color: this.lineColor,
                        width: this.lineWidth
                    };
                    
                    // Для изогнутой линии - контрольная точка посередине, смещенная в сторону
                    if (isCurved && fromCenter && toCenter) {
                        const midX = (fromCenter.x + toCenter.x) / 2;
                        const midY = (fromCenter.y + toCenter.y) / 2;
                        // Смещаем перпендикулярно линии
                        const dx = toCenter.x - fromCenter.x;
                        const dy = toCenter.y - fromCenter.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const offset = Math.min(50, len * 0.3);
                        newEdge.controlPoint = {
                            x: midX - (dy / len) * offset,
                            y: midY + (dx / len) * offset
                        };
                    }
                    
                    this.edges.push(newEdge);
                    this.connectingFrom = null;
                    this.connectingTo = null;
                    this.clearSelection();
                    this.redraw();
                }
            }
        } else if (this.currentTool === 'text') {
            // Создаем новый текст
            const textId = 'text_' + Date.now();
            const newText = {
                id: textId,
                x: canvasPos.x,
                y: canvasPos.y,
                text: 'Текст',
                color: this.lineColor,
                fontSize: 16,
                fontFamily: 'sans-serif'
            };
            this.texts.push(newText);
            this.selectedText = newText;
            this.selectedNode = null;
            this.selectedEdge = null;
            this.selectedImage = null;
            this.selectedDrawing = null;
            this.redraw();
            // Сразу открываем редактирование
            setTimeout(() => this.editText(newText), 100);
        } else if (this.currentTool === 'zone') {
            // Создаем новую зону (задний план)
            const zoneId = 'zone_' + Date.now();
            const newZone = {
                id: zoneId,
                x: canvasPos.x - 100,
                y: canvasPos.y - 75,
                width: 200,
                height: 150,
                title: '',
                color: this.lineColor,
                opacity: 0.15
            };
            this.zones.push(newZone);
            this.selectedZone = newZone;
            this.clearSelection();
            this.selectedZone = newZone;
            this.redraw();
        } else if (this.currentTool === 'sticker') {
            // Создаем новый стикер Post-it
            const stickerId = 'sticker_' + Date.now();
            const stickerColors = ['#fee75c', '#ffb3ba', '#bae1ff', '#baffc9'];
            const randomColor = stickerColors[Math.floor(Math.random() * stickerColors.length)];
            const newSticker = {
                id: stickerId,
                x: canvasPos.x - 40,
                y: canvasPos.y - 30,
                width: 80,
                height: 60,
                text: '',
                color: randomColor
            };
            this.stickers.push(newSticker);
            this.selectedSticker = newSticker;
            this.clearSelection();
            this.selectedSticker = newSticker;
            this.redraw();
            // Сразу открываем редактирование
            setTimeout(() => this.editSticker(newSticker), 100);
        } else if (this.currentTool === 'frame') {
            // Создаем новую рамку-контейнер
            const frameId = 'frame_' + Date.now();
            const newFrame = {
                id: frameId,
                x: canvasPos.x - 100,
                y: canvasPos.y - 75,
                width: 200,
                height: 150,
                title: 'Группа',
                color: this.lineColor
            };
            this.frames.push(newFrame);
            this.selectedFrame = newFrame;
            this.clearSelection();
            this.selectedFrame = newFrame;
            this.redraw();
        } else {
            // Select tool - выбираем объект (проверяем в порядке от верхних к нижним слоям)
            const isCtrl = e.ctrlKey || e.metaKey;
            
            // Сначала проверяем контрольные точки изогнутых линий
            const edgeWithControlPoint = this.getEdgeControlPointAt(canvasPos.x, canvasPos.y);
            if (edgeWithControlPoint) {
                if (!isCtrl) this.clearSelection();
                this.selectedEdge = edgeWithControlPoint;
                this.draggingControlPoint = true;
                this.redraw();
                return;
            }
            
            const node = this.getNodeAt(canvasPos.x, canvasPos.y);
            const edge = this.getEdgeAt(canvasPos.x, canvasPos.y);
            const image = this.getImageAt(canvasPos.x, canvasPos.y);
            const drawing = this.getDrawingAt(canvasPos.x, canvasPos.y);
            const text = this.getTextAt(canvasPos.x, canvasPos.y);
            const sticker = this.getStickerAt(canvasPos.x, canvasPos.y);
            const frame = this.getFrameAt(canvasPos.x, canvasPos.y);
            // Зоны не выделяются в Select tool - только в Pan tool
            
            // Находим кликнутый объект
            let clickedType = null;
            let clickedObj = null;
            
            if (node) { clickedType = 'node'; clickedObj = node; }
            else if (sticker) { clickedType = 'sticker'; clickedObj = sticker; }
            else if (image) { clickedType = 'image'; clickedObj = image; }
            else if (edge) { clickedType = 'edge'; clickedObj = edge; }
            else if (drawing) { clickedType = 'drawing'; clickedObj = drawing; }
            else if (text) { clickedType = 'text'; clickedObj = text; }
            else if (frame) { clickedType = 'frame'; clickedObj = frame; }
            
            if (clickedObj) {
                if (isCtrl) {
                    // Ctrl+клик - добавляем/убираем из выделения
                    if (this.isSelected(clickedType, clickedObj)) {
                        this.removeFromSelection(clickedType, clickedObj);
                        // Убираем из одиночного выделения если это он
                        if (clickedType === 'node' && this.selectedNode === clickedObj) this.selectedNode = null;
                        if (clickedType === 'edge' && this.selectedEdge === clickedObj) this.selectedEdge = null;
                        if (clickedType === 'image' && this.selectedImage === clickedObj) this.selectedImage = null;
                        if (clickedType === 'drawing' && this.selectedDrawing === clickedObj) this.selectedDrawing = null;
                        if (clickedType === 'text' && this.selectedText === clickedObj) this.selectedText = null;
                        if (clickedType === 'sticker' && this.selectedSticker === clickedObj) this.selectedSticker = null;
                        if (clickedType === 'frame' && this.selectedFrame === clickedObj) this.selectedFrame = null;
                    } else {
                        this.addToSelection(clickedType, clickedObj);
                    }
                } else {
                    // Обычный клик
                    // Если кликнули на уже выделенный объект из множественного выделения - готовимся к перемещению
                    if (this.selectedObjects.length > 0 && this.isSelected(clickedType, clickedObj)) {
                        // Сохраняем offsets для всех выделенных объектов
                        this.prepareDragOffsets(canvasPos);
                    } else {
                        // Новое выделение
                        this.clearSelection();
                        this.addToSelection(clickedType, clickedObj);
                        
                        // Также устанавливаем одиночное выделение для совместимости
                        if (clickedType === 'node') {
                            this.selectedNode = node;
                            const shapeSelect = document.getElementById('canvas-node-shape');
                            if (shapeSelect) shapeSelect.value = node.shape || 'rectangle';
                            this.updateTodoButtonVisibility();
                        }
                        else if (clickedType === 'sticker') this.selectedSticker = sticker;
                        else if (clickedType === 'image') this.selectedImage = image;
                        else if (clickedType === 'edge') this.selectedEdge = edge;
                        else if (clickedType === 'drawing') this.selectedDrawing = drawing;
                        else if (clickedType === 'text') this.selectedText = text;
                        else if (clickedType === 'frame') this.selectedFrame = frame;
                    }
                    
                    // Сохраняем offsets для перемещения
                    this.prepareDragOffsets(canvasPos);
                }
            } else {
                // Клик на пустое место - начинаем рамку выделения
                if (!isCtrl) this.clearSelection();
                this.isSelectionBox = true;
                this.selectionBoxStart = { x: canvasPos.x, y: canvasPos.y };
                this.selectionBoxEnd = { x: canvasPos.x, y: canvasPos.y };
                this.updateTodoButtonVisibility();
            }
            this.redraw();
        }
    }
    
    // Подготовить offsets для перемещения множества объектов
    prepareDragOffsets(canvasPos) {
        this.dragOffsets = [];
        const allSelected = this.getAllSelected();
        for (const sel of allSelected) {
            const pos = this.getObjectPosition(sel.type, sel.obj);
            if (pos) {
                this.dragOffsets.push({
                    type: sel.type,
                    obj: sel.obj,
                    offsetX: canvasPos.x - pos.x,
                    offsetY: canvasPos.y - pos.y
                });
            }
        }
    }
    
    // Получить позицию объекта
    getObjectPosition(type, obj) {
        switch (type) {
            case 'node': return { x: obj.x, y: obj.y };
            case 'image': return { x: obj.x, y: obj.y };
            case 'text': return { x: obj.x, y: obj.y };
            case 'sticker': return { x: obj.x, y: obj.y };
            case 'frame': return { x: obj.x, y: obj.y };
            case 'zone': return { x: obj.x, y: obj.y };
            case 'drawing': {
                if (obj.points && obj.points.length > 0) {
                    return { x: obj.points[0].x, y: obj.points[0].y };
                }
                return null;
            }
            default: return null;
        }
    }
    
    // Переместить все выделенные объекты
    moveSelectedObjects(canvasPos) {
        for (const offset of this.dragOffsets) {
            const newX = canvasPos.x - offset.offsetX;
            const newY = canvasPos.y - offset.offsetY;
            
            switch (offset.type) {
                case 'node':
                case 'image':
                case 'text':
                case 'sticker':
                case 'frame':
                case 'zone':
                    offset.obj.x = newX;
                    offset.obj.y = newY;
                    break;
                case 'drawing':
                    if (offset.obj.points && offset.obj.points.length > 0) {
                        const dx = newX - offset.obj.points[0].x;
                        const dy = newY - offset.obj.points[0].y;
                        for (const point of offset.obj.points) {
                            point.x += dx;
                            point.y += dy;
                        }
                    }
                    break;
            }
        }
    }
    
    clearSelection() {
        this.selectedNode = null;
        this.selectedEdge = null;
        this.selectedImage = null;
        this.selectedDrawing = null;
        this.selectedText = null;
        this.selectedZone = null;
        this.selectedSticker = null;
        this.selectedFrame = null;
        this.selectedObjects = [];
        this.dragOffsets = [];
    }
    
    // Добавить объект в множественное выделение
    addToSelection(type, obj) {
        // Проверяем, не выделен ли уже
        const exists = this.selectedObjects.find(s => s.type === type && s.obj === obj);
        if (!exists) {
            this.selectedObjects.push({ type, obj });
        }
    }
    
    // Удалить объект из множественного выделения
    removeFromSelection(type, obj) {
        this.selectedObjects = this.selectedObjects.filter(s => !(s.type === type && s.obj === obj));
    }
    
    // Проверить, выделен ли объект
    isSelected(type, obj) {
        // Проверяем одиночное выделение
        if (type === 'node' && this.selectedNode === obj) return true;
        if (type === 'edge' && this.selectedEdge === obj) return true;
        if (type === 'image' && this.selectedImage === obj) return true;
        if (type === 'drawing' && this.selectedDrawing === obj) return true;
        if (type === 'text' && this.selectedText === obj) return true;
        if (type === 'zone' && this.selectedZone === obj) return true;
        if (type === 'sticker' && this.selectedSticker === obj) return true;
        if (type === 'frame' && this.selectedFrame === obj) return true;
        // Проверяем множественное выделение
        return this.selectedObjects.some(s => s.type === type && s.obj === obj);
    }
    
    // Получить все выделенные объекты
    getAllSelected() {
        const selected = [...this.selectedObjects];
        // Добавляем одиночные выделения если есть
        if (this.selectedNode && !selected.find(s => s.type === 'node' && s.obj === this.selectedNode)) {
            selected.push({ type: 'node', obj: this.selectedNode });
        }
        if (this.selectedEdge && !selected.find(s => s.type === 'edge' && s.obj === this.selectedEdge)) {
            selected.push({ type: 'edge', obj: this.selectedEdge });
        }
        if (this.selectedImage && !selected.find(s => s.type === 'image' && s.obj === this.selectedImage)) {
            selected.push({ type: 'image', obj: this.selectedImage });
        }
        if (this.selectedDrawing && !selected.find(s => s.type === 'drawing' && s.obj === this.selectedDrawing)) {
            selected.push({ type: 'drawing', obj: this.selectedDrawing });
        }
        if (this.selectedText && !selected.find(s => s.type === 'text' && s.obj === this.selectedText)) {
            selected.push({ type: 'text', obj: this.selectedText });
        }
        if (this.selectedZone && !selected.find(s => s.type === 'zone' && s.obj === this.selectedZone)) {
            selected.push({ type: 'zone', obj: this.selectedZone });
        }
        if (this.selectedSticker && !selected.find(s => s.type === 'sticker' && s.obj === this.selectedSticker)) {
            selected.push({ type: 'sticker', obj: this.selectedSticker });
        }
        if (this.selectedFrame && !selected.find(s => s.type === 'frame' && s.obj === this.selectedFrame)) {
            selected.push({ type: 'frame', obj: this.selectedFrame });
        }
        return selected;
    }
    
    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const canvasPos = this.screenToCanvas(x, y);
        
        // Изменение размера зоны
        if (this.resizingZone && this.resizeHandle && (e.buttons & 1)) {
            const zone = this.resizingZone;
            const minSize = 50;
            
            switch (this.resizeHandle) {
                case 'se':
                    zone.width = Math.max(minSize, canvasPos.x - zone.x);
                    zone.height = Math.max(minSize, canvasPos.y - zone.y);
                    break;
                case 'sw':
                    const newWidthSW = zone.x + zone.width - canvasPos.x;
                    if (newWidthSW >= minSize) {
                        zone.x = canvasPos.x;
                        zone.width = newWidthSW;
                    }
                    zone.height = Math.max(minSize, canvasPos.y - zone.y);
                    break;
                case 'ne':
                    zone.width = Math.max(minSize, canvasPos.x - zone.x);
                    const newHeightNE = zone.y + zone.height - canvasPos.y;
                    if (newHeightNE >= minSize) {
                        zone.y = canvasPos.y;
                        zone.height = newHeightNE;
                    }
                    break;
                case 'nw':
                    const newWidthNW = zone.x + zone.width - canvasPos.x;
                    const newHeightNW = zone.y + zone.height - canvasPos.y;
                    if (newWidthNW >= minSize) {
                        zone.x = canvasPos.x;
                        zone.width = newWidthNW;
                    }
                    if (newHeightNW >= minSize) {
                        zone.y = canvasPos.y;
                        zone.height = newHeightNW;
                    }
                    break;
            }
            this.redraw();
        }
        // Перетаскивание контрольной точки изогнутой линии
        else if (this.draggingControlPoint && this.selectedEdge && (e.buttons & 1)) {
            this.selectedEdge.controlPoint = { x: canvasPos.x, y: canvasPos.y };
            this.redraw();
        }
        // Перемещение зоны в pan режиме
        else if (this.currentTool === 'pan' && this.selectedZone && !this.resizingZone && (e.buttons & 1)) {
            this.selectedZone.x = canvasPos.x - this.dragOffset.x;
            this.selectedZone.y = canvasPos.y - this.dragOffset.y;
            this.redraw();
        }
        else if (this.isPanning) {
            // Панорамирование
            this.panOffset.x += x - this.lastMousePos.x;
            this.panOffset.y += y - this.lastMousePos.y;
            this.redraw();
        } else if (this.isDrawing && this.currentTool === 'pencil' && this.selectedDrawing) {
            // Рисование
            this.selectedDrawing.points.push({ x: canvasPos.x, y: canvasPos.y });
            this.redraw();
        } else if (this.currentTool === 'select' && (e.buttons & 1)) {
            // Рамка выделения
            if (this.isSelectionBox) {
                this.selectionBoxEnd = { x: canvasPos.x, y: canvasPos.y };
                this.redraw();
            }
            // Перемещение объектов (множественное или одиночное)
            else if (this.dragOffsets.length > 0) {
                this.moveSelectedObjects(canvasPos);
                this.redraw();
            }
            // Fallback для одиночного перемещения
            else if (this.selectedNode) {
                this.selectedNode.x = canvasPos.x - this.dragOffset.x;
                this.selectedNode.y = canvasPos.y - this.dragOffset.y;
                this.redraw();
            } else if (this.selectedImage) {
                this.selectedImage.x = canvasPos.x - this.dragOffset.x;
                this.selectedImage.y = canvasPos.y - this.dragOffset.y;
                this.redraw();
            } else if (this.selectedText) {
                this.selectedText.x = canvasPos.x - this.dragOffset.x;
                this.selectedText.y = canvasPos.y - this.dragOffset.y;
                this.redraw();
            } else if (this.selectedSticker) {
                this.selectedSticker.x = canvasPos.x - this.dragOffset.x;
                this.selectedSticker.y = canvasPos.y - this.dragOffset.y;
                this.redraw();
            } else if (this.selectedFrame) {
                this.selectedFrame.x = canvasPos.x - this.dragOffset.x;
                this.selectedFrame.y = canvasPos.y - this.dragOffset.y;
                this.redraw();
            }
        }
        
        this.lastMousePos = { x, y };
        
        // Обновляем курсор при наведении на ручки изменения размера (в режиме pan)
        if (this.currentTool === 'pan' && !this.isPanning && !this.resizingZone && !(e.buttons & 1)) {
            const handle = this.getZoneResizeHandle(canvasPos.x, canvasPos.y);
            if (handle) {
                this.canvas.style.cursor = this.getResizeCursor(handle.handle);
            } else {
                const zone = this.getZoneAt(canvasPos.x, canvasPos.y);
                this.canvas.style.cursor = zone ? 'move' : 'grab';
            }
        }
    }
    
    onMouseUp(e) {
        if (this.isDrawing && this.currentTool === 'pencil') {
            this.isDrawing = false;
        }
        
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.getCursorForTool(this.currentTool);
        }
        
        // Сбрасываем изменение размера зоны
        if (this.resizingZone) {
            this.resizingZone = null;
            this.resizeHandle = null;
            this.canvas.style.cursor = this.getCursorForTool(this.currentTool);
        }
        
        // Сбрасываем перетаскивание контрольной точки
        if (this.draggingControlPoint) {
            this.draggingControlPoint = false;
        }
        
        // Завершаем рамку выделения
        if (this.isSelectionBox) {
            this.finishSelectionBox(e.ctrlKey || e.metaKey);
            this.isSelectionBox = false;
            this.selectionBoxStart = null;
            this.selectionBoxEnd = null;
            this.redraw();
        }
    }
    
    // Завершить рамку выделения и выделить объекты внутри
    finishSelectionBox(addToExisting) {
        if (!this.selectionBoxStart || !this.selectionBoxEnd) return;
        
        const x1 = Math.min(this.selectionBoxStart.x, this.selectionBoxEnd.x);
        const y1 = Math.min(this.selectionBoxStart.y, this.selectionBoxEnd.y);
        const x2 = Math.max(this.selectionBoxStart.x, this.selectionBoxEnd.x);
        const y2 = Math.max(this.selectionBoxStart.y, this.selectionBoxEnd.y);
        
        // Минимальный размер рамки для выделения
        if (Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5) return;
        
        if (!addToExisting) {
            this.clearSelection();
        }
        
        // Проверяем все объекты
        // Nodes
        for (const node of this.nodes) {
            if (this.isObjectInBox(node.x, node.y, node.width, node.height, x1, y1, x2, y2)) {
                this.addToSelection('node', node);
            }
        }
        
        // Images
        for (const img of this.images) {
            if (this.isObjectInBox(img.x, img.y, img.width || 100, img.height || 100, x1, y1, x2, y2)) {
                this.addToSelection('image', img);
            }
        }
        
        // Texts
        for (const text of this.texts) {
            this.ctx.save();
            this.ctx.font = `${text.fontSize}px ${text.fontFamily}`;
            const metrics = this.ctx.measureText(text.text);
            const textWidth = metrics.width;
            const textHeight = text.fontSize;
            this.ctx.restore();
            if (this.isObjectInBox(text.x, text.y - textHeight, textWidth, textHeight, x1, y1, x2, y2)) {
                this.addToSelection('text', text);
            }
        }
        
        // Stickers
        for (const sticker of this.stickers) {
            if (this.isObjectInBox(sticker.x, sticker.y, sticker.width, sticker.height, x1, y1, x2, y2)) {
                this.addToSelection('sticker', sticker);
            }
        }
        
        // Frames
        for (const frame of this.frames) {
            if (this.isObjectInBox(frame.x, frame.y, frame.width, frame.height, x1, y1, x2, y2)) {
                this.addToSelection('frame', frame);
            }
        }
        
        // Drawings
        for (const drawing of this.drawings) {
            if (drawing.points && drawing.points.length > 0) {
                // Проверяем если хотя бы одна точка внутри рамки
                const inBox = drawing.points.some(p => 
                    p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2
                );
                if (inBox) {
                    this.addToSelection('drawing', drawing);
                }
            }
        }
        
        // Edges
        for (const edge of this.edges) {
            const fromType = edge.fromType || 'node';
            const toType = edge.toType || 'node';
            const fromObj = this.getObjectById(fromType, edge.from);
            const toObj = this.getObjectById(toType, edge.to);
            if (fromObj && toObj) {
                const fromCenter = this.getObjectCenter(fromType, fromObj);
                const toCenter = this.getObjectCenter(toType, toObj);
                if (fromCenter && toCenter) {
                    // Проверяем если центры обоих объектов или контрольная точка внутри рамки
                    const fromIn = fromCenter.x >= x1 && fromCenter.x <= x2 && fromCenter.y >= y1 && fromCenter.y <= y2;
                    const toIn = toCenter.x >= x1 && toCenter.x <= x2 && toCenter.y >= y1 && toCenter.y <= y2;
                    if (fromIn && toIn) {
                        this.addToSelection('edge', edge);
                    }
                }
            }
        }
    }
    
    // Проверить, находится ли объект внутри рамки выделения
    isObjectInBox(objX, objY, objW, objH, boxX1, boxY1, boxX2, boxY2) {
        // Объект считается внутри если хотя бы часть пересекается
        return !(objX + objW < boxX1 || objX > boxX2 || objY + objH < boxY1 || objY > boxY2);
    }
    
    onDoubleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const canvasPos = this.screenToCanvas(x, y);
        
        if (this.currentTool === 'select') {
            if (this.selectedNode) {
                // Редактирование текста блока
                const newText = prompt('Введите текст блока:', this.selectedNode.text);
                if (newText !== null) {
                    this.selectedNode.text = newText;
                    this.updateNodeSize(this.selectedNode);
                    this.redraw();
                }
            } else if (this.selectedText) {
                // Редактирование текста
                this.editText(this.selectedText);
            } else if (this.selectedZone) {
                // Редактирование заголовка зоны
                const newTitle = prompt('Введите заголовок зоны:', this.selectedZone.title || '');
                if (newTitle !== null) {
                    this.selectedZone.title = newTitle;
                    this.redraw();
                }
            } else if (this.selectedSticker) {
                // Редактирование текста стикера
                this.editSticker(this.selectedSticker);
            } else if (this.selectedFrame) {
                // Редактирование заголовка рамки
                const newTitle = prompt('Введите заголовок рамки:', this.selectedFrame.title || '');
                if (newTitle !== null) {
                    this.selectedFrame.title = newTitle;
                    this.redraw();
                }
            } else if (this.selectedEdge) {
                // Добавить/удалить контрольную точку на линии
                if (this.selectedEdge.controlPoint) {
                    // Удаляем контрольную точку (делаем линию прямой)
                    delete this.selectedEdge.controlPoint;
                } else {
                    // Добавляем контрольную точку в месте клика
                    this.selectedEdge.controlPoint = {
                        x: canvasPos.x,
                        y: canvasPos.y
                    };
                }
                this.redraw();
            }
        }
    }
    
    updateNodeSize(node) {
        // Подстраиваем размер блока под текст
        this.ctx.save();
        this.ctx.font = '14px sans-serif';
        const metrics = this.ctx.measureText(node.text);
        const textWidth = metrics.width;
        const textHeight = 20;
        
        const shape = node.shape || 'rectangle';
        const padding = 20; // Уменьшили padding для более компактного вида
        
        if (shape === 'diamond') {
            // Для ромба нужно учитывать диагональную форму
            // Ромб повернут на 45 градусов, поэтому текст должен помещаться внутри
            // Для ромба: вписанный прямоугольник имеет размеры примерно width/√2 x height/√2
            // Чтобы текст поместился: width/√2 >= textWidth + padding и height/√2 >= textHeight + padding
            const sqrt2 = Math.sqrt(2);
            const minPadding = 12; // Минимальный отступ от края ромба
            
            // Вычисляем минимальные размеры ромба для размещения текста
            // Для ромба: размер = (размер текста + padding) * √2
            const minWidthForText = (textWidth + minPadding) * sqrt2;
            const minHeightForText = (textHeight + minPadding) * sqrt2;
            
            // Ромб может растягиваться по ширине или высоте в зависимости от текста
            // Минимальный размер должен быть достаточным для размещения текста
            const minSize = 50; // Минимальный размер ромба (уменьшили для более компактного вида)
            
            // Устанавливаем размеры ромба: он будет растягиваться при необходимости
            // Если текст широкий, ромб будет шире; если высокий - выше
            node.width = Math.max(minSize, minWidthForText);
            node.height = Math.max(minSize, minHeightForText);
        } else if (shape === 'circle' || shape === 'star' || shape === 'hexagon') {
            // Для круглых форм используем максимальный размер
            const maxSize = Math.max(textWidth, textHeight) + padding;
            node.width = Math.max(80, maxSize);
            node.height = Math.max(80, maxSize);
        } else {
            // Для прямоугольных форм
            node.width = Math.max(80, textWidth + padding);
            node.height = Math.max(40, textHeight + 20);
        }
        this.ctx.restore();
    }
    
    onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(3, this.scale * zoomFactor));
        
        const scaleDiff = newScale / this.scale;
        this.panOffset.x = x - (x - this.panOffset.x) * scaleDiff;
        this.panOffset.y = y - (y - this.panOffset.y) * scaleDiff;
        this.scale = newScale;
        
        this.redraw();
    }
    
    getNodeAt(x, y) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            if (x >= node.x && x <= node.x + node.width &&
                y >= node.y && y <= node.y + node.height) {
                return node;
            }
        }
        return null;
    }
    
    getImageAt(x, y) {
        for (let i = this.images.length - 1; i >= 0; i--) {
            const img = this.images[i];
            if (x >= img.x && x <= img.x + img.width &&
                y >= img.y && y <= img.y + img.height) {
                return img;
            }
        }
        return null;
    }
    
    getDrawingAt(x, y) {
        // Проверяем ближайший рисунок
        let minDist = 20;
        let closest = null;
        
        for (const drawing of this.drawings) {
            for (const point of drawing.points) {
                const dist = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closest = drawing;
                }
            }
        }
        
        return closest;
    }
    
    getEdgeAt(x, y) {
        for (const edge of this.edges) {
            const fromType = edge.fromType || 'node';
            const toType = edge.toType || 'node';
            
            const fromObj = this.getObjectById(fromType, edge.from);
            const toObj = this.getObjectById(toType, edge.to);
            if (!fromObj || !toObj) continue;
            
            const fromCenter = this.getObjectCenter(fromType, fromObj);
            const toCenter = this.getObjectCenter(toType, toObj);
            if (!fromCenter || !toCenter) continue;
            
            // Если есть контрольная точка (изогнутая линия)
            if (edge.controlPoint) {
                const dist = this.distanceToBezier(x, y, fromCenter.x, fromCenter.y, 
                    edge.controlPoint.x, edge.controlPoint.y, toCenter.x, toCenter.y);
                if (dist < 15) {
                    return edge;
                }
            } else {
                const dist = this.distanceToLineSegment(x, y, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
                if (dist < 10) {
                    return edge;
                }
            }
        }
        return null;
    }
    
    // Проверка клика на контрольную точку изогнутой линии
    getEdgeControlPointAt(x, y) {
        for (const edge of this.edges) {
            if (edge.controlPoint) {
                const dx = x - edge.controlPoint.x;
                const dy = y - edge.controlPoint.y;
                if (Math.sqrt(dx * dx + dy * dy) < 10) {
                    return edge;
                }
            }
        }
        return null;
    }
    
    // Расстояние до квадратичной кривой Безье
    distanceToBezier(px, py, x0, y0, cx, cy, x1, y1) {
        let minDist = Infinity;
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
            const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
            const dist = Math.sqrt((px - bx) ** 2 + (py - by) ** 2);
            if (dist < minDist) minDist = dist;
        }
        return minDist;
    }
    
    getTextAt(x, y) {
        // Проверяем тексты с обратной стороны (сначала последние)
        for (let i = this.texts.length - 1; i >= 0; i--) {
            const text = this.texts[i];
            this.ctx.save();
            this.ctx.font = `${text.fontSize}px ${text.fontFamily}`;
            const metrics = this.ctx.measureText(text.text);
            const textWidth = metrics.width;
            const textHeight = text.fontSize;
            this.ctx.restore();
            
            // Проверяем попадание в область текста
            if (x >= text.x && x <= text.x + textWidth &&
                y >= text.y - textHeight && y <= text.y) {
                return text;
            }
        }
        return null;
    }
    
    getZoneAt(x, y) {
        // Проверяем зоны с обратной стороны (сначала последние)
        for (let i = this.zones.length - 1; i >= 0; i--) {
            const zone = this.zones[i];
            if (x >= zone.x && x <= zone.x + zone.width &&
                y >= zone.y && y <= zone.y + zone.height) {
                return zone;
            }
        }
        return null;
    }
    
    // Получить ручку изменения размера зоны
    getZoneResizeHandle(x, y) {
        const handleSize = 12;
        
        for (let i = this.zones.length - 1; i >= 0; i--) {
            const zone = this.zones[i];
            const handles = {
                'nw': { x: zone.x, y: zone.y },
                'ne': { x: zone.x + zone.width, y: zone.y },
                'sw': { x: zone.x, y: zone.y + zone.height },
                'se': { x: zone.x + zone.width, y: zone.y + zone.height }
            };
            
            for (const [handle, pos] of Object.entries(handles)) {
                if (Math.abs(x - pos.x) < handleSize && Math.abs(y - pos.y) < handleSize) {
                    return { zone, handle };
                }
            }
        }
        return null;
    }
    
    getResizeCursor(handle) {
        const cursors = {
            'nw': 'nw-resize',
            'ne': 'ne-resize',
            'sw': 'sw-resize',
            'se': 'se-resize'
        };
        return cursors[handle] || 'default';
    }
    
    // Рисуем ручки изменения размера зоны
    drawZoneResizeHandles(ctx, zone) {
        const handleSize = 8;
        const handles = [
            { x: zone.x, y: zone.y },
            { x: zone.x + zone.width, y: zone.y },
            { x: zone.x, y: zone.y + zone.height },
            { x: zone.x + zone.width, y: zone.y + zone.height }
        ];
        
        ctx.fillStyle = '#43b581';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        
        handles.forEach(h => {
            ctx.beginPath();
            ctx.arc(h.x, h.y, handleSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }
    
    getStickerAt(x, y) {
        // Проверяем стикеры с обратной стороны (сначала последние)
        for (let i = this.stickers.length - 1; i >= 0; i--) {
            const sticker = this.stickers[i];
            if (x >= sticker.x && x <= sticker.x + sticker.width &&
                y >= sticker.y && y <= sticker.y + sticker.height) {
                return sticker;
            }
        }
        return null;
    }
    
    getFrameAt(x, y) {
        // Проверяем рамки с обратной стороны (сначала последние)
        for (let i = this.frames.length - 1; i >= 0; i--) {
            const frame = this.frames[i];
            // Проверяем только границы рамки (не внутреннее пространство)
            const borderWidth = 20;
            const inOuterBox = x >= frame.x && x <= frame.x + frame.width &&
                               y >= frame.y && y <= frame.y + frame.height;
            const inInnerBox = x >= frame.x + borderWidth && x <= frame.x + frame.width - borderWidth &&
                               y >= frame.y + 30 && y <= frame.y + frame.height - borderWidth; // 30 для заголовка
            
            if (inOuterBox && !inInnerBox) {
                return frame;
            }
        }
        return null;
    }
    
    // Получает любой объект по координатам (для создания соединений)
    getAnyObjectAt(x, y) {
        // Проверяем в порядке от верхних слоёв к нижним
        const node = this.getNodeAt(x, y);
        if (node) return { type: 'node', obj: node };
        
        const sticker = this.getStickerAt(x, y);
        if (sticker) return { type: 'sticker', obj: sticker };
        
        const image = this.getImageAt(x, y);
        if (image) return { type: 'image', obj: image };
        
        const text = this.getTextAt(x, y);
        if (text) return { type: 'text', obj: text };
        
        const frame = this.getFrameAt(x, y);
        if (frame) return { type: 'frame', obj: frame };
        
        const zone = this.getZoneAt(x, y);
        if (zone) return { type: 'zone', obj: zone };
        
        return null;
    }
    
    // Подсветка объекта при создании соединения
    highlightConnecting(target) {
        this.clearSelection();
        switch (target.type) {
            case 'node': this.selectedNode = target.obj; break;
            case 'sticker': this.selectedSticker = target.obj; break;
            case 'image': this.selectedImage = target.obj; break;
            case 'text': this.selectedText = target.obj; break;
            case 'frame': this.selectedFrame = target.obj; break;
            case 'zone': this.selectedZone = target.obj; break;
        }
    }
    
    // Получить объект по типу и ID
    getObjectById(type, id) {
        switch (type) {
            case 'node': return this.nodes.find(n => n.id === id);
            case 'zone': return this.zones.find(z => z.id === id);
            case 'sticker': return this.stickers.find(s => s.id === id);
            case 'frame': return this.frames.find(f => f.id === id);
            case 'image': return this.images.find(i => i.id === id);
            case 'text': return this.texts.find(t => t.id === id);
            default: return null;
        }
    }
    
    // Получить центр объекта
    getObjectCenter(type, obj) {
        if (!obj) return null;
        
        switch (type) {
            case 'node':
            case 'zone':
            case 'sticker':
            case 'frame':
            case 'image':
                return {
                    x: obj.x + obj.width / 2,
                    y: obj.y + obj.height / 2
                };
            case 'text':
                this.ctx.save();
                this.ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
                const metrics = this.ctx.measureText(obj.text);
                this.ctx.restore();
                return {
                    x: obj.x + metrics.width / 2,
                    y: obj.y - obj.fontSize / 2
                };
            default:
                return null;
        }
    }
    
    // Получить границы объекта для расчёта точки пересечения
    getObjectBounds(type, obj) {
        if (!obj) return null;
        
        switch (type) {
            case 'node':
            case 'zone':
            case 'sticker':
            case 'frame':
            case 'image':
                return {
                    x: obj.x,
                    y: obj.y,
                    width: obj.width,
                    height: obj.height
                };
            case 'text':
                this.ctx.save();
                this.ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
                const metrics = this.ctx.measureText(obj.text);
                this.ctx.restore();
                return {
                    x: obj.x,
                    y: obj.y - obj.fontSize,
                    width: metrics.width,
                    height: obj.fontSize
                };
            default:
                return null;
        }
    }
    
    // Расчёт пересечения с прямоугольником
    getRectIntersection(bounds, fromX, fromY, toX, toY) {
        if (!bounds) return { x: fromX, y: fromY };
        
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        
        // Ребра прямоугольника
        const edges = [
            [{ x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y }], // верх
            [{ x: bounds.x + bounds.width, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y + bounds.height }], // право
            [{ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, { x: bounds.x, y: bounds.y + bounds.height }], // низ
            [{ x: bounds.x, y: bounds.y + bounds.height }, { x: bounds.x, y: bounds.y }] // лево
        ];
        
        let closestIntersection = { x: centerX, y: centerY };
        let minDist = Infinity;
        
        for (const [p1, p2] of edges) {
            const intersection = this.lineSegmentIntersection(
                fromX, fromY, toX, toY,
                p1.x, p1.y, p2.x, p2.y
            );
            if (intersection) {
                const dist = Math.sqrt((intersection.x - fromX) ** 2 + (intersection.y - fromY) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closestIntersection = intersection;
                }
            }
        }
        
        return closestIntersection;
    }
    
    editText(textObj) {
        const newText = prompt('Введите текст:', textObj.text);
        if (newText !== null) {
            textObj.text = newText;
            this.redraw();
        }
    }
    
    editSticker(sticker) {
        const newText = prompt('Введите текст стикера:', sticker.text || '');
        if (newText !== null) {
            sticker.text = newText;
            this.updateStickerSize(sticker);
            this.redraw();
        }
    }
    
    // Автоматический размер стикера под текст
    updateStickerSize(sticker) {
        if (!sticker.text) {
            // Минимальный размер для пустого стикера
            sticker.width = Math.max(sticker.width, 80);
            sticker.height = Math.max(sticker.height, 60);
            return;
        }
        
        this.ctx.save();
        this.ctx.font = '13px sans-serif';
        
        const padding = 16;
        const lineHeight = 18;
        const minWidth = 80;
        const minHeight = 60;
        const maxWidth = 300;
        
        // Разбиваем текст на слова
        const words = sticker.text.split(' ');
        
        // Пробуем найти оптимальную ширину
        let bestWidth = minWidth;
        let bestHeight = minHeight;
        
        // Сначала измеряем если весь текст в одну строку
        const fullTextWidth = this.ctx.measureText(sticker.text).width + padding * 2;
        
        if (fullTextWidth <= maxWidth) {
            // Текст помещается в одну строку
            bestWidth = Math.max(minWidth, fullTextWidth);
            bestHeight = lineHeight + padding * 2;
        } else {
            // Нужен перенос - ищем оптимальную ширину
            const targetWidth = Math.min(maxWidth, Math.max(minWidth, Math.sqrt(fullTextWidth * lineHeight * 2)));
            
            // Вычисляем количество строк для этой ширины
            let lines = 1;
            let line = '';
            const contentWidth = targetWidth - padding * 2;
            
            for (let i = 0; i < words.length; i++) {
                const testLine = line + words[i] + ' ';
                const metrics = this.ctx.measureText(testLine);
                if (metrics.width > contentWidth && i > 0) {
                    line = words[i] + ' ';
                    lines++;
                } else {
                    line = testLine;
                }
            }
            
            bestWidth = targetWidth;
            bestHeight = lines * lineHeight + padding * 2;
        }
        
        // Учитываем загнутый уголок (минимум 30px высоты для уголка)
        bestHeight = Math.max(bestHeight, 50);
        
        sticker.width = Math.max(minWidth, Math.ceil(bestWidth));
        sticker.height = Math.max(minHeight, Math.ceil(bestHeight));
        
        this.ctx.restore();
    }
    
    distanceToLineSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length2 = dx * dx + dy * dy;
        if (length2 === 0) {
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    }
    
    // Вычисляет точку пересечения линии с границей блока
    lineSegmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        // Находит пересечение двух отрезков (x1,y1)-(x2,y2) и (x3,y3)-(x4,y4)
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null; // Параллельные линии
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        // Проверяем, что пересечение находится внутри обоих отрезков
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }
        return null;
    }
    
    getNodeIntersection(node, fromX, fromY, toX, toY, useLastIntersection = false) {
        const centerX = node.x + node.width / 2;
        const centerY = node.y + node.height / 2;
        
        // Для прямоугольника находим пересечение с границей
        const shape = node.shape || 'rectangle';
        
        if (shape === 'circle') {
            // Для круга находим пересечение луча от fromX,fromY к toX,toY с границей круга
            const radius = Math.min(node.width, node.height) / 2;
            const dx = toX - fromX;
            const dy = toY - fromY;
            
            // Нормализуем направление луча
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return { x: centerX, y: centerY };
            
            const dirX = dx / length;
            const dirY = dy / length;
            
            // Пересечение луча с окружностью
            const a = fromX - centerX;
            const b = fromY - centerY;
            const A = dirX * dirX + dirY * dirY;
            const B = 2 * (a * dirX + b * dirY);
            const C = a * a + b * b - radius * radius;
            
            const discriminant = B * B - 4 * A * C;
            if (discriminant < 0) {
                return { x: centerX, y: centerY };
            }
            
            const sqrtD = Math.sqrt(discriminant);
            const t1 = (-B - sqrtD) / (2 * A);
            const t2 = (-B + sqrtD) / (2 * A);
            
            // Выбираем пересечение на основе расстояния от fromX,fromY
            const p1 = { x: fromX + t1 * dirX, y: fromY + t1 * dirY };
            const p2 = { x: fromX + t2 * dirX, y: fromY + t2 * dirY };
            const dist1 = Math.sqrt((p1.x - fromX) ** 2 + (p1.y - fromY) ** 2);
            const dist2 = Math.sqrt((p2.x - fromX) ** 2 + (p2.y - fromY) ** 2);
            
            // useLastIntersection = true означает выбрать дальнее пересечение (для toNode)
            // useLastIntersection = false означает выбрать ближнее пересечение (для fromNode)
            const t = useLastIntersection ? (dist2 > dist1 ? t2 : t1) : (dist1 < dist2 ? t1 : t2);
            
            // Выбираем только положительные t (пересечения вперед по лучу)
            if (t1 >= 0 && t2 >= 0) {
                return {
                    x: fromX + t * dirX,
                    y: fromY + t * dirY
                };
            } else if (t1 >= 0) {
                return { x: p1.x, y: p1.y };
            } else if (t2 >= 0) {
                return { x: p2.x, y: p2.y };
            }
            
            return { x: centerX, y: centerY };
        } else if (shape === 'ellipse') {
            // Для эллипса находим пересечение луча от fromX,fromY к toX,toY с границей эллипса
            const radiusX = node.width / 2;
            const radiusY = node.height / 2;
            const dx = toX - fromX;
            const dy = toY - fromY;
            
            // Нормализуем направление луча
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return { x: centerX, y: centerY };
            
            const dirX = dx / length;
            const dirY = dy / length;
            
            // Параметрическое уравнение луча: x = fromX + t*dirX, y = fromY + t*dirY
            // Уравнение эллипса: ((x-centerX)/radiusX)^2 + ((y-centerY)/radiusY)^2 = 1
            // Подставляем луч в уравнение эллипса:
            // ((fromX + t*dirX - centerX)/radiusX)^2 + ((fromY + t*dirY - centerY)/radiusY)^2 = 1
            // Пусть a = (fromX - centerX), b = (fromY - centerY)
            // ((a + t*dirX)/radiusX)^2 + ((b + t*dirY)/radiusY)^2 = 1
            // (a + t*dirX)^2/radiusX^2 + (b + t*dirY)^2/radiusY^2 = 1
            // Раскрываем скобки и приводим к квадратному уравнению At^2 + Bt + C = 0
            const a = fromX - centerX;
            const b = fromY - centerY;
            const A = (dirX * dirX) / (radiusX * radiusX) + (dirY * dirY) / (radiusY * radiusY);
            const B = 2 * (a * dirX) / (radiusX * radiusX) + 2 * (b * dirY) / (radiusY * radiusY);
            const C = (a * a) / (radiusX * radiusX) + (b * b) / (radiusY * radiusY) - 1;
            
            // Решаем квадратное уравнение
            const discriminant = B * B - 4 * A * C;
            if (discriminant < 0) {
                // Нет пересечения, возвращаем центр
                return { x: centerX, y: centerY };
            }
            
            const sqrtD = Math.sqrt(discriminant);
            const t1 = (-B - sqrtD) / (2 * A);
            const t2 = (-B + sqrtD) / (2 * A);
            
            // Выбираем пересечение на основе расстояния от fromX,fromY
            const p1 = { x: fromX + t1 * dirX, y: fromY + t1 * dirY };
            const p2 = { x: fromX + t2 * dirX, y: fromY + t2 * dirY };
            const dist1 = Math.sqrt((p1.x - fromX) ** 2 + (p1.y - fromY) ** 2);
            const dist2 = Math.sqrt((p2.x - fromX) ** 2 + (p2.y - fromY) ** 2);
            
            // useLastIntersection = true означает выбрать дальнее пересечение (для toNode)
            // useLastIntersection = false означает выбрать ближнее пересечение (для fromNode)
            const t = useLastIntersection ? (dist2 > dist1 ? t2 : t1) : (dist1 < dist2 ? t1 : t2);
            
            // Выбираем только положительные t (пересечения вперед по лучу)
            if (t1 >= 0 && t2 >= 0) {
                return {
                    x: fromX + t * dirX,
                    y: fromY + t * dirY
                };
            } else if (t1 >= 0) {
                return { x: p1.x, y: p1.y };
            } else if (t2 >= 0) {
                return { x: p2.x, y: p2.y };
            }
            
            return { x: centerX, y: centerY };
        } else if (shape === 'triangle') {
            // Треугольник: вершины (centerX, y), (x+width, y+height), (x, y+height)
            const v1 = { x: centerX, y: node.y };
            const v2 = { x: node.x + node.width, y: node.y + node.height };
            const v3 = { x: node.x, y: node.y + node.height };
            
            const intersections = [];
            const edges = [
                [v1, v2],
                [v2, v3],
                [v3, v1]
            ];
            
            for (const [p1, p2] of edges) {
                const intersection = this.lineSegmentIntersection(
                    fromX, fromY, toX, toY,
                    p1.x, p1.y, p2.x, p2.y
                );
                if (intersection) {
                    intersections.push(intersection);
                }
            }
            
            if (intersections.length > 0) {
                intersections.sort((a, b) => {
                    const distA = Math.sqrt((a.x - fromX) ** 2 + (a.y - fromY) ** 2);
                    const distB = Math.sqrt((b.x - fromX) ** 2 + (b.y - fromY) ** 2);
                    return distA - distB;
                });
                return useLastIntersection ? intersections[intersections.length - 1] : intersections[0];
            }
        } else if (shape === 'diamond') {
            // Ромб: вершины (centerX, y), (x+width, centerY), (centerX, y+height), (x, centerY)
            const v1 = { x: centerX, y: node.y };
            const v2 = { x: node.x + node.width, y: centerY };
            const v3 = { x: centerX, y: node.y + node.height };
            const v4 = { x: node.x, y: centerY };
            
            const intersections = [];
            const edges = [
                [v1, v2],
                [v2, v3],
                [v3, v4],
                [v4, v1]
            ];
            
            for (const [p1, p2] of edges) {
                const intersection = this.lineSegmentIntersection(
                    fromX, fromY, toX, toY,
                    p1.x, p1.y, p2.x, p2.y
                );
                if (intersection) {
                    intersections.push(intersection);
                }
            }
            
            if (intersections.length > 0) {
                intersections.sort((a, b) => {
                    const distA = Math.sqrt((a.x - fromX) ** 2 + (a.y - fromY) ** 2);
                    const distB = Math.sqrt((b.x - fromX) ** 2 + (b.y - fromY) ** 2);
                    return distA - distB;
                });
                return useLastIntersection ? intersections[intersections.length - 1] : intersections[0];
            }
        } else if (shape === 'hexagon') {
            // Шестиугольник: правильный, с радиусом Math.min(width, height) / 2
            const radius = Math.min(node.width, node.height) / 2;
            const vertices = [];
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI) / 3;
                vertices.push({
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                });
            }
            
            const intersections = [];
            for (let i = 0; i < 6; i++) {
                const p1 = vertices[i];
                const p2 = vertices[(i + 1) % 6];
                const intersection = this.lineSegmentIntersection(
                    fromX, fromY, toX, toY,
                    p1.x, p1.y, p2.x, p2.y
                );
                if (intersection) {
                    intersections.push(intersection);
                }
            }
            
            if (intersections.length > 0) {
                intersections.sort((a, b) => {
                    const distA = Math.sqrt((a.x - fromX) ** 2 + (a.y - fromY) ** 2);
                    const distB = Math.sqrt((b.x - fromX) ** 2 + (b.y - fromY) ** 2);
                    return distA - distB;
                });
                return useLastIntersection ? intersections[intersections.length - 1] : intersections[0];
            }
        } else if (shape === 'star') {
            // Звезда: используем описанную окружность
            const radius = Math.min(node.width, node.height) / 2;
            const dx = toX - fromX;
            const dy = toY - fromY;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length === 0) return { x: centerX, y: centerY };
            
            const dirX = dx / length;
            const dirY = dy / length;
            
            // Пересечение луча с окружностью
            const a = fromX - centerX;
            const b = fromY - centerY;
            const A = dirX * dirX + dirY * dirY;
            const B = 2 * (a * dirX + b * dirY);
            const C = a * a + b * b - radius * radius;
            
            const discriminant = B * B - 4 * A * C;
            if (discriminant >= 0) {
                const sqrtD = Math.sqrt(discriminant);
                const t1 = (-B - sqrtD) / (2 * A);
                const t2 = (-B + sqrtD) / (2 * A);
                
                // Выбираем пересечение на основе расстояния от fromX,fromY
                const p1 = { x: fromX + t1 * dirX, y: fromY + t1 * dirY };
                const p2 = { x: fromX + t2 * dirX, y: fromY + t2 * dirY };
                const dist1 = Math.sqrt((p1.x - fromX) ** 2 + (p1.y - fromY) ** 2);
                const dist2 = Math.sqrt((p2.x - fromX) ** 2 + (p2.y - fromY) ** 2);
                
                const t = useLastIntersection ? (dist2 > dist1 ? t2 : t1) : (dist1 < dist2 ? t1 : t2);
                
                if (t1 >= 0 && t2 >= 0) {
                    return {
                        x: fromX + t * dirX,
                        y: fromY + t * dirY
                    };
                } else if (t1 >= 0) {
                    return { x: p1.x, y: p1.y };
                } else if (t2 >= 0) {
                    return { x: p2.x, y: p2.y };
                }
            }
        } else {
            // Для прямоугольника и других форм используем пересечение с прямоугольной границей
            const intersections = [];
            const left = node.x;
            const right = node.x + node.width;
            const top = node.y;
            const bottom = node.y + node.height;
            
            // Проверяем пересечение с каждой стороной прямоугольника
            const dx = toX - fromX;
            const dy = toY - fromY;
            
            // Левая сторона
            if (dx !== 0) {
                const t = (left - fromX) / dx;
                if (t >= 0 && t <= 1) {
                    const y = fromY + t * dy;
                    if (y >= top && y <= bottom) {
                        intersections.push({ x: left, y, t });
                    }
                }
            }
            
            // Правая сторона
            if (dx !== 0) {
                const t = (right - fromX) / dx;
                if (t >= 0 && t <= 1) {
                    const y = fromY + t * dy;
                    if (y >= top && y <= bottom) {
                        intersections.push({ x: right, y, t });
                    }
                }
            }
            
            // Верхняя сторона
            if (dy !== 0) {
                const t = (top - fromY) / dy;
                if (t >= 0 && t <= 1) {
                    const x = fromX + t * dx;
                    if (x >= left && x <= right) {
                        intersections.push({ x, y: top, t });
                    }
                }
            }
            
            // Нижняя сторона
            if (dy !== 0) {
                const t = (bottom - fromY) / dy;
                if (t >= 0 && t <= 1) {
                    const x = fromX + t * dx;
                    if (x >= left && x <= right) {
                        intersections.push({ x, y: bottom, t });
                    }
                }
            }
            
            // Берем пересечение (первое или последнее)
            if (intersections.length > 0) {
                intersections.sort((a, b) => a.t - b.t);
                const index = useLastIntersection ? intersections.length - 1 : 0;
                return { x: intersections[index].x, y: intersections[index].y };
            }
        }
        
        // Fallback - возвращаем центр
        return { x: centerX, y: centerY };
    }
    
    setLineStyle(style) {
        this.lineStyle = style;
    }
    
    setColor(color) {
        this.lineColor = color;
        this.strokeColor = color;
    }
    
    setFillColor(color) {
        this.fillColor = color;
    }
    
    setArrowStyle(style) {
        this.arrowStyle = style;
    }
    
    setNodeShape(shape) {
        this.nodeShape = shape;
    }
    
    getCursorForTool(tool) {
        const cursors = {
            select: 'default',
            pan: 'move',
            pencil: 'crosshair',
            node: 'crosshair',
            line: 'crosshair',
            arrow: 'crosshair',
            text: 'text'
        };
        return cursors[tool] || 'default';
    }
    
    setTool(tool) {
        this.currentTool = tool;
        this.canvas.style.cursor = this.getCursorForTool(tool);
        this.connectingFrom = null;
        this.connectingTo = null;
        
        // Обновляем селектор формы блока при выделении
        if (this.selectedNode && tool === 'select') {
            const shapeSelect = document.getElementById('canvas-node-shape');
            if (shapeSelect && this.selectedNode.shape) {
                shapeSelect.value = this.selectedNode.shape;
            }
        }
    }
    
    loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Позиционируем изображение в центре видимой области canvas
                const rect = this.container.getBoundingClientRect();
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const canvasPos = this.screenToCanvas(centerX, centerY);
                
                // Ограничиваем размер изображения
                const maxWidth = 400;
                const maxHeight = 400;
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = width * ratio;
                    height = height * ratio;
                }
                
                const imageData = {
                    id: 'img_' + Date.now(),
                    image: img,
                    x: canvasPos.x - width / 2,
                    y: canvasPos.y - height / 2,
                    width: width,
                    height: height
                };
                this.images.push(imageData);
                this.selectedImage = imageData;
                this.selectedNode = null;
                this.selectedEdge = null;
                this.selectedDrawing = null;
                this.redraw();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    deleteSelected() {
        let deleted = false;
        
        // Множественное удаление
        const allSelected = this.getAllSelected();
        if (allSelected.length > 0) {
            for (const sel of allSelected) {
                this.deleteObject(sel.type, sel.obj);
            }
            this.clearSelection();
            deleted = true;
        }
        // Fallback для одиночного выделения
        else if (this.selectedNode) {
            const nodeId = this.selectedNode.id;
            this.nodes = this.nodes.filter(n => n.id !== nodeId);
            this.edges = this.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
            this.selectedNode = null;
            deleted = true;
        } else if (this.selectedEdge) {
            this.edges = this.edges.filter(e => e.id !== this.selectedEdge.id);
            this.selectedEdge = null;
            deleted = true;
        } else if (this.selectedImage) {
            this.images = this.images.filter(img => img.id !== this.selectedImage.id);
            this.selectedImage = null;
            deleted = true;
        } else if (this.selectedDrawing) {
            this.drawings = this.drawings.filter(d => d.id !== this.selectedDrawing.id);
            this.selectedDrawing = null;
            deleted = true;
        } else if (this.selectedText) {
            this.texts = this.texts.filter(t => t.id !== this.selectedText.id);
            this.selectedText = null;
            deleted = true;
        } else if (this.selectedZone) {
            const zoneId = this.selectedZone.id;
            this.zones = this.zones.filter(z => z.id !== zoneId);
            this.edges = this.edges.filter(e => e.from !== zoneId && e.to !== zoneId);
            this.selectedZone = null;
            deleted = true;
        } else if (this.selectedSticker) {
            const stickerId = this.selectedSticker.id;
            this.stickers = this.stickers.filter(s => s.id !== stickerId);
            this.edges = this.edges.filter(e => e.from !== stickerId && e.to !== stickerId);
            this.selectedSticker = null;
            deleted = true;
        } else if (this.selectedFrame) {
            const frameId = this.selectedFrame.id;
            this.frames = this.frames.filter(f => f.id !== frameId);
            this.edges = this.edges.filter(e => e.from !== frameId && e.to !== frameId);
            this.selectedFrame = null;
            deleted = true;
        }
        
        if (deleted) {
            this.updateTodoButtonVisibility();
            this.redraw();
        }
    }
    
    // Выделить все объекты
    selectAll() {
        this.clearSelection();
        
        // Добавляем все nodes
        for (const node of this.nodes) {
            this.addToSelection('node', node);
        }
        // Добавляем все images
        for (const img of this.images) {
            this.addToSelection('image', img);
        }
        // Добавляем все texts
        for (const text of this.texts) {
            this.addToSelection('text', text);
        }
        // Добавляем все stickers
        for (const sticker of this.stickers) {
            this.addToSelection('sticker', sticker);
        }
        // Добавляем все frames
        for (const frame of this.frames) {
            this.addToSelection('frame', frame);
        }
        // Добавляем все zones
        for (const zone of this.zones) {
            this.addToSelection('zone', zone);
        }
        // Добавляем все drawings
        for (const drawing of this.drawings) {
            this.addToSelection('drawing', drawing);
        }
        // Добавляем все edges
        for (const edge of this.edges) {
            this.addToSelection('edge', edge);
        }
        
        this.redraw();
    }
    
    // Удалить конкретный объект по типу
    deleteObject(type, obj) {
        const id = obj.id;
        switch (type) {
            case 'node':
                this.nodes = this.nodes.filter(n => n.id !== id);
                this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
                break;
            case 'edge':
                this.edges = this.edges.filter(e => e.id !== id);
                break;
            case 'image':
                this.images = this.images.filter(img => img.id !== id);
                this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
                break;
            case 'drawing':
                this.drawings = this.drawings.filter(d => d.id !== id);
                break;
            case 'text':
                this.texts = this.texts.filter(t => t.id !== id);
                this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
                break;
            case 'zone':
                this.zones = this.zones.filter(z => z.id !== id);
                this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
                break;
            case 'sticker':
                this.stickers = this.stickers.filter(s => s.id !== id);
                this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
                break;
            case 'frame':
                this.frames = this.frames.filter(f => f.id !== id);
                this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
                break;
        }
    }
    
    // Получить позицию чекбокса TODO для блока
    getTodoCheckboxPosition(node) {
        const checkboxSize = 18;
        const offset = 12; // Расстояние от блока
        return {
            x: node.x - checkboxSize - offset, // Слева от блока
            y: node.y + (node.height - checkboxSize) / 2, // По центру по вертикали
            size: checkboxSize
        };
    }
    
    // Проверить, попал ли клик в чекбокс TODO
    getTodoCheckboxAt(x, y) {
        for (const node of this.nodes) {
            if (node.todo === undefined) continue;
            const pos = this.getTodoCheckboxPosition(node);
            if (x >= pos.x && x <= pos.x + pos.size &&
                y >= pos.y && y <= pos.y + pos.size) {
                return node;
            }
        }
        return null;
    }
    
    // Нарисовать чекбокс TODO
    drawTodoCheckbox(ctx, node) {
        const pos = this.getTodoCheckboxPosition(node);
        const size = pos.size;
        
        ctx.save();
        ctx.globalAlpha = 1;
        
        // Рисуем квадрат
        ctx.strokeStyle = '#dcddde';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x, pos.y, size, size);
        
        // Если TODO выполнен, рисуем галочку
        if (node.todo) {
            // Заливаем квадрат зеленым цветом
            ctx.fillStyle = 'rgba(67, 181, 129, 0.15)';
            ctx.fillRect(pos.x, pos.y, size, size);
            
            // Рисуем галочку
            ctx.strokeStyle = '#43b581';
            ctx.fillStyle = '#43b581';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            // Рисуем правильную галочку (✓)
            ctx.moveTo(pos.x + 5, pos.y + size / 2);
            ctx.lineTo(pos.x + size / 2, pos.y + size - 5);
            ctx.lineTo(pos.x + size - 5, pos.y + 5);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // Переключить TODO для выбранного блока
    toggleTodo() {
        if (this.selectedNode) {
            if (this.selectedNode.todo === undefined) {
                this.selectedNode.todo = true;
            } else {
                this.selectedNode.todo = !this.selectedNode.todo;
            }
            this.redraw();
        }
    }
    
    // Обновить видимость кнопки TODO
    updateTodoButtonVisibility() {
        const todoBtn = document.getElementById('canvas-todo-btn');
        if (todoBtn) {
            todoBtn.style.display = this.selectedNode ? 'inline-flex' : 'none';
        }
    }
    
    applyLineStyle(ctx, style, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash([]);
        
        switch (style) {
            case 'dashed':
                ctx.setLineDash([10, 5]);
                break;
            case 'dotted':
                ctx.setLineDash([2, 5]);
                break;
            case 'dashdot':
                ctx.setLineDash([10, 5, 2, 5]);
                break;
            case 'wave':
                // Волна рисуется как путь
                break;
            default:
                ctx.setLineDash([]);
        }
    }
    
    drawNodeShape(ctx, x, y, width, height, shape) {
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        
        ctx.beginPath();
        
        switch (shape) {
            case 'circle':
                ctx.arc(centerX, centerY, Math.min(width, height) / 2, 0, Math.PI * 2);
                break;
            case 'ellipse':
                ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
                break;
            case 'triangle':
                ctx.moveTo(centerX, y);
                ctx.lineTo(x + width, y + height);
                ctx.lineTo(x, y + height);
                ctx.closePath();
                break;
            case 'diamond':
                ctx.moveTo(centerX, y);
                ctx.lineTo(x + width, centerY);
                ctx.lineTo(centerX, y + height);
                ctx.lineTo(x, centerY);
                ctx.closePath();
                break;
            case 'star':
                const spikes = 5;
                const outerRadius = Math.min(width, height) / 2;
                const innerRadius = outerRadius * 0.4;
                for (let i = 0; i < spikes * 2; i++) {
                    const radius = i % 2 === 0 ? outerRadius : innerRadius;
                    const angle = (i * Math.PI) / spikes - Math.PI / 2;
                    const px = centerX + radius * Math.cos(angle);
                    const py = centerY + radius * Math.sin(angle);
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                break;
            case 'hexagon':
                const radius = Math.min(width, height) / 2;
                for (let i = 0; i < 6; i++) {
                    const angle = (i * Math.PI) / 3;
                    const px = centerX + radius * Math.cos(angle);
                    const py = centerY + radius * Math.sin(angle);
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                break;
            case 'rectangle':
            default:
                ctx.rect(x, y, width, height);
                break;
        }
        
        ctx.fill();
        ctx.stroke();
    }
    
    getArrowMaxLength(style) {
        // Возвращает максимальную длину наконечника стрелки для данного стиля
        const arrowLength = 12;
        switch (style) {
            case 'double':
                return arrowLength * 2.2; // Самая длинная стрелка
            case 'diamond':
                return arrowLength;
            case 'open':
                return arrowLength;
            case 'closed':
                return arrowLength;
            case 'normal':
            default:
                return arrowLength;
        }
    }
    
    drawArrow(ctx, x, y, angle, color, style, width) {
        const arrowLength = 12;
        const arrowAngle = Math.PI / 6;
        
        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        
        switch (style) {
            case 'double':
                // Двойная стрелка
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle - arrowAngle),
                    y - arrowLength * Math.sin(angle - arrowAngle)
                );
                ctx.lineTo(
                    x - arrowLength * 0.7 * Math.cos(angle),
                    y - arrowLength * 0.7 * Math.sin(angle)
                );
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle + arrowAngle),
                    y - arrowLength * Math.sin(angle + arrowAngle)
                );
                ctx.closePath();
                ctx.fill();
                
                ctx.beginPath();
                ctx.moveTo(x - arrowLength * 1.5 * Math.cos(angle), y - arrowLength * 1.5 * Math.sin(angle));
                ctx.lineTo(
                    x - arrowLength * 2.2 * Math.cos(angle - arrowAngle),
                    y - arrowLength * 2.2 * Math.sin(angle - arrowAngle)
                );
                ctx.lineTo(
                    x - arrowLength * 1.9 * Math.cos(angle),
                    y - arrowLength * 1.9 * Math.sin(angle)
                );
                ctx.lineTo(
                    x - arrowLength * 2.2 * Math.cos(angle + arrowAngle),
                    y - arrowLength * 2.2 * Math.sin(angle + arrowAngle)
                );
                ctx.closePath();
                ctx.fill();
                break;
            case 'open':
                // Открытая стрелка
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle - arrowAngle),
                    y - arrowLength * Math.sin(angle - arrowAngle)
                );
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle + arrowAngle),
                    y - arrowLength * Math.sin(angle + arrowAngle)
                );
                ctx.stroke();
                break;
            case 'closed':
                // Закрытая стрелка (заполненный треугольник)
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle - arrowAngle),
                    y - arrowLength * Math.sin(angle - arrowAngle)
                );
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle + arrowAngle),
                    y - arrowLength * Math.sin(angle + arrowAngle)
                );
                ctx.closePath();
                ctx.fill();
                break;
            case 'diamond':
                // Ромб
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x - arrowLength * 0.7 * Math.cos(angle - arrowAngle),
                    y - arrowLength * 0.7 * Math.sin(angle - arrowAngle)
                );
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle),
                    y - arrowLength * Math.sin(angle)
                );
                ctx.lineTo(
                    x - arrowLength * 0.7 * Math.cos(angle + arrowAngle),
                    y - arrowLength * 0.7 * Math.sin(angle + arrowAngle)
                );
                ctx.closePath();
                ctx.fill();
                break;
            case 'normal':
            default:
                // Обычная стрелка
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle - arrowAngle),
                    y - arrowLength * Math.sin(angle - arrowAngle)
                );
                ctx.lineTo(
                    x - arrowLength * Math.cos(angle + arrowAngle),
                    y - arrowLength * Math.sin(angle + arrowAngle)
                );
                ctx.closePath();
                ctx.fill();
                break;
        }
        
        ctx.restore();
    }
    
    drawWave(ctx, x1, y1, x2, y2, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash([]);
        ctx.beginPath();
        
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const segments = Math.max(10, Math.floor(distance / 20));
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = x1 + dx * t;
            const y = y1 + dy * t + Math.sin(t * Math.PI * 4) * 5;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        
        // Стрелка для волны больше не рисуется здесь - рисуется отдельно в redraw()
    }
    
    redraw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Сохраняем контекст и применяем трансформации
        ctx.save();
        ctx.translate(this.panOffset.x, this.panOffset.y);
        ctx.scale(this.scale, this.scale);
        
        // Рисуем сетку
        this.drawGrid(ctx);
        
        // 1. Рисуем зоны (самый задний план)
        this.drawZones(ctx);
        
        // 2. Рисуем рамки
        this.drawFrames(ctx);
        
        // 3. Рисуем рисунки карандашом
        this.drawDrawings(ctx);
        
        // 4. Рисуем изображения
        this.images.forEach(img => {
            ctx.save();
            if (img === this.selectedImage || this.isSelected('image', img)) {
                ctx.strokeStyle = '#43b581';
                ctx.lineWidth = 3;
                ctx.strokeRect(img.x - 2, img.y - 2, img.width + 4, img.height + 4);
            }
            ctx.drawImage(img.image, img.x, img.y, img.width, img.height);
            ctx.restore();
        });
        
        // 5. Рисуем стикеры
        this.drawStickers(ctx);
        
        // Рисуем блоки (сначала, чтобы соединения были поверх)
        this.nodes.forEach(node => {
            ctx.save();
            
            // Если блок имеет TODO и он выполнен, делаем его прозрачным
            if (node.todo) {
                ctx.globalAlpha = 0.6;
            }
            
            ctx.fillStyle = node.fillColor;
            const isNodeSelected = node === this.selectedNode || this.isSelected('node', node);
            ctx.strokeStyle = isNodeSelected ? '#43b581' : node.strokeColor;
            ctx.lineWidth = isNodeSelected ? 3 : node.strokeWidth;
            
            const shape = node.shape || 'rectangle';
            this.drawNodeShape(ctx, node.x, node.y, node.width, node.height, shape);
            
            // Текст
            ctx.globalAlpha = 1; // Текст всегда непрозрачный
            ctx.fillStyle = '#dcddde';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.text, node.x + node.width / 2, node.y + node.height / 2);
            
            // Рисуем чекбокс TODO, если он есть
            if (node.todo !== undefined) {
                this.drawTodoCheckbox(ctx, node);
            }
            
            ctx.restore();
        });
        
        // Рисуем соединения (после блоков, чтобы стрелки были поверх)
        this.edges.forEach(edge => {
            // Поддержка старого формата (from/to как id узлов) и нового (fromType/toType)
            const fromType = edge.fromType || 'node';
            const toType = edge.toType || 'node';
            
            const fromObj = this.getObjectById(fromType, edge.from);
            const toObj = this.getObjectById(toType, edge.to);
            if (!fromObj || !toObj) return;
            
            // Центры объектов
            const fromCenter = this.getObjectCenter(fromType, fromObj);
            const toCenter = this.getObjectCenter(toType, toObj);
            if (!fromCenter || !toCenter) return;
            
            // Для узлов используем расчёт пересечения с формой, для остальных - простой расчёт границ
            let fromX, fromY, toIntersectionX, toIntersectionY;
            
            if (fromType === 'node') {
                const fromIntersection = this.getNodeIntersection(fromObj, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, false);
                fromX = fromIntersection.x;
                fromY = fromIntersection.y;
            } else {
                const bounds = this.getObjectBounds(fromType, fromObj);
                const intersection = this.getRectIntersection(bounds, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
                fromX = intersection.x;
                fromY = intersection.y;
            }
            
            if (toType === 'node') {
                const toIntersection = this.getNodeIntersection(toObj, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, true);
                toIntersectionX = toIntersection.x;
                toIntersectionY = toIntersection.y;
            } else {
                const bounds = this.getObjectBounds(toType, toObj);
                const intersection = this.getRectIntersection(bounds, toCenter.x, toCenter.y, fromCenter.x, fromCenter.y);
                toIntersectionX = intersection.x;
                toIntersectionY = intersection.y;
            }
            
            const arrowStyle = edge.arrowStyle || 'normal';
            
            ctx.save();
            const isEdgeSelected = edge === this.selectedEdge || this.isSelected('edge', edge);
            if (isEdgeSelected) {
                ctx.strokeStyle = '#43b581';
                ctx.lineWidth = edge.width + 2;
            } else {
                ctx.strokeStyle = edge.color;
                ctx.lineWidth = edge.width;
            }
            
            // Изогнутая линия с контрольной точкой
            if (edge.controlPoint) {
                const cp = edge.controlPoint;
                
                // Вычисляем угол стрелки в конечной точке кривой Безье
                // Производная квадратичной кривой Безье при t=1: 2*(P2 - P1)
                const tangentX = 2 * (toIntersectionX - cp.x);
                const tangentY = 2 * (toIntersectionY - cp.y);
                const angle = Math.atan2(tangentY, tangentX);
                
                // Отодвигаем конец линии назад для стрелки
                let lineEndX = toIntersectionX;
                let lineEndY = toIntersectionY;
                if (arrowStyle !== 'none') {
                    const arrowMaxLength = this.getArrowMaxLength(arrowStyle);
                    lineEndX = toIntersectionX - arrowMaxLength * Math.cos(angle);
                    lineEndY = toIntersectionY - arrowMaxLength * Math.sin(angle);
                }
                
                this.applyLineStyle(ctx, edge.style, edge.color, edge.width);
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.quadraticCurveTo(cp.x, cp.y, lineEndX, lineEndY);
                ctx.stroke();
                
                if (arrowStyle !== 'none') {
                    this.drawArrow(ctx, toIntersectionX, toIntersectionY, angle, edge.color, arrowStyle, edge.width);
                }
                
                // Рисуем контрольную точку если линия выделена
                if (isEdgeSelected) {
                    ctx.fillStyle = '#43b581';
                    ctx.beginPath();
                    ctx.arc(cp.x, cp.y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            } else {
                // Прямая линия
                const angle = Math.atan2(toIntersectionY - fromY, toIntersectionX - fromX);
                
                let lineEndX = toIntersectionX;
                let lineEndY = toIntersectionY;
                if (arrowStyle !== 'none') {
                    const arrowMaxLength = this.getArrowMaxLength(arrowStyle);
                    lineEndX = toIntersectionX - arrowMaxLength * Math.cos(angle);
                    lineEndY = toIntersectionY - arrowMaxLength * Math.sin(angle);
                }
                
                if (edge.style === 'wave') {
                    this.drawWave(ctx, fromX, fromY, lineEndX, lineEndY, edge.color, edge.width);
                    if (arrowStyle !== 'none') {
                        this.drawArrow(ctx, toIntersectionX, toIntersectionY, angle, edge.color, arrowStyle, edge.width);
                    }
                } else {
                    this.applyLineStyle(ctx, edge.style, edge.color, edge.width);
                    ctx.beginPath();
                    ctx.moveTo(fromX, fromY);
                    ctx.lineTo(lineEndX, lineEndY);
                    ctx.stroke();
                    
                    if (arrowStyle !== 'none') {
                        this.drawArrow(ctx, toIntersectionX, toIntersectionY, angle, edge.color, arrowStyle, edge.width);
                    }
                }
            }
            ctx.restore();
        });
        
        // Рисуем ручки изменения размера для выбранной зоны (в режиме pan)
        if (this.selectedZone && this.currentTool === 'pan') {
            this.drawZoneResizeHandles(ctx, this.selectedZone);
        }
        
        // Рисуем тексты
        this.texts.forEach(text => {
            ctx.save();
            ctx.font = `${text.fontSize}px ${text.fontFamily}`;
            ctx.fillStyle = (text === this.selectedText || this.isSelected('text', text)) ? '#43b581' : text.color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(text.text, text.x, text.y);
            ctx.restore();
        });
        
        // Рисуем подсветку множественного выделения
        this.drawMultipleSelectionHighlight(ctx);
        
        // Рисуем рамку выделения
        if (this.isSelectionBox && this.selectionBoxStart && this.selectionBoxEnd) {
            ctx.save();
            ctx.strokeStyle = '#5865f2';
            ctx.lineWidth = 1 / this.scale;
            ctx.setLineDash([5 / this.scale, 5 / this.scale]);
            ctx.fillStyle = 'rgba(88, 101, 242, 0.1)';
            
            const x = Math.min(this.selectionBoxStart.x, this.selectionBoxEnd.x);
            const y = Math.min(this.selectionBoxStart.y, this.selectionBoxEnd.y);
            const w = Math.abs(this.selectionBoxEnd.x - this.selectionBoxStart.x);
            const h = Math.abs(this.selectionBoxEnd.y - this.selectionBoxStart.y);
            
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }
        
        // Восстанавливаем контекст
        ctx.restore();
        
        // Вызываем callback для автосохранения
        if (this.onChange) {
            this.onChange();
        }
    }
    
    // Рисуем подсветку для множественного выделения
    drawMultipleSelectionHighlight(ctx) {
        if (this.selectedObjects.length <= 1) return;
        
        ctx.save();
        ctx.strokeStyle = '#43b581';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        
        for (const sel of this.selectedObjects) {
            const bounds = this.getSelectionBounds(sel.type, sel.obj);
            if (bounds) {
                ctx.strokeRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);
            }
        }
        
        ctx.restore();
    }
    
    // Получить границы объекта для подсветки
    getSelectionBounds(type, obj) {
        switch (type) {
            case 'node':
                return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
            case 'image':
                return { x: obj.x, y: obj.y, width: obj.width || 100, height: obj.height || 100 };
            case 'sticker':
                return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
            case 'frame':
                return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
            case 'zone':
                return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
            case 'text':
                this.ctx.save();
                this.ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
                const metrics = this.ctx.measureText(obj.text);
                this.ctx.restore();
                return { x: obj.x, y: obj.y - obj.fontSize, width: metrics.width, height: obj.fontSize };
            case 'drawing':
                if (obj.points && obj.points.length > 0) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const p of obj.points) {
                        minX = Math.min(minX, p.x);
                        minY = Math.min(minY, p.y);
                        maxX = Math.max(maxX, p.x);
                        maxY = Math.max(maxY, p.y);
                    }
                    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                }
                return null;
            default:
                return null;
        }
    }
    
    drawGrid(ctx) {
        ctx.strokeStyle = '#36393f';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        const gridSize = 50;
        // Координаты сетки в пространстве canvas (до трансформаций)
        const canvasWidth = this.canvas.width / this.scale;
        const canvasHeight = this.canvas.height / this.scale;
        const startX = Math.floor(-this.panOffset.x / this.scale / gridSize) * gridSize;
        const startY = Math.floor(-this.panOffset.y / this.scale / gridSize) * gridSize;
        const endX = startX + canvasWidth + gridSize;
        const endY = startY + canvasHeight + gridSize;
        
        for (let x = startX; x < endX; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
            ctx.stroke();
        }
        
        for (let y = startY; y < endY; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
        }
    }
    
    // ========== ОТРИСОВКА ЗОН ==========
    
    drawZones(ctx) {
        this.zones.forEach(zone => {
            ctx.save();
            const isZoneSelected = zone === this.selectedZone || this.isSelected('zone', zone);
            
            // Полупрозрачная заливка
            ctx.globalAlpha = zone.opacity || 0.15;
            ctx.fillStyle = zone.color;
            ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
            
            // Рамка
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = zone.color;
            ctx.lineWidth = isZoneSelected ? 3 : 2;
            ctx.setLineDash(isZoneSelected ? [] : [5, 5]);
            ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
            
            // Заголовок (если есть)
            if (zone.title) {
                ctx.globalAlpha = 0.8;
                ctx.fillStyle = zone.color;
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(zone.title, zone.x + 8, zone.y + 8);
            }
            
            // Выделение
            if (isZoneSelected) {
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#43b581';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
                ctx.strokeRect(zone.x - 2, zone.y - 2, zone.width + 4, zone.height + 4);
            }
            
            ctx.restore();
        });
    }
    
    // ========== ОТРИСОВКА РАМОК ==========
    
    drawFrames(ctx) {
        this.frames.forEach(frame => {
            ctx.save();
            const isFrameSelected = frame === this.selectedFrame || this.isSelected('frame', frame);
            
            // Заголовок фон
            ctx.fillStyle = frame.color;
            ctx.globalAlpha = 0.2;
            ctx.fillRect(frame.x, frame.y, frame.width, 28);
            
            // Рамка
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = frame.color;
            ctx.lineWidth = isFrameSelected ? 3 : 2;
            ctx.setLineDash([]);
            ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
            
            // Заголовок текст
            ctx.globalAlpha = 1;
            ctx.fillStyle = frame.color;
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(frame.title || 'Группа', frame.x + 10, frame.y + 14);
            
            // Выделение
            if (isFrameSelected) {
                ctx.strokeStyle = '#43b581';
                ctx.lineWidth = 2;
                ctx.strokeRect(frame.x - 2, frame.y - 2, frame.width + 4, frame.height + 4);
            }
            
            ctx.restore();
        });
    }
    
    // ========== ОТРИСОВКА СТИКЕРОВ ==========
    
    drawStickers(ctx) {
        this.stickers.forEach(sticker => {
            ctx.save();
            
            // Тень
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;
            
            // Основной прямоугольник
            ctx.fillStyle = sticker.color;
            ctx.fillRect(sticker.x, sticker.y, sticker.width, sticker.height);
            
            // Загнутый уголок (пропорциональный размеру)
            ctx.shadowColor = 'transparent';
            const cornerSize = Math.min(20, sticker.width * 0.15, sticker.height * 0.25);
            ctx.fillStyle = this.darkenColor(sticker.color, 20);
            ctx.beginPath();
            ctx.moveTo(sticker.x + sticker.width - cornerSize, sticker.y);
            ctx.lineTo(sticker.x + sticker.width, sticker.y + cornerSize);
            ctx.lineTo(sticker.x + sticker.width, sticker.y);
            ctx.closePath();
            ctx.fill();
            
            // Складка уголка
            ctx.fillStyle = this.darkenColor(sticker.color, 40);
            ctx.beginPath();
            ctx.moveTo(sticker.x + sticker.width - cornerSize, sticker.y);
            ctx.lineTo(sticker.x + sticker.width - cornerSize, sticker.y + cornerSize);
            ctx.lineTo(sticker.x + sticker.width, sticker.y + cornerSize);
            ctx.closePath();
            ctx.fill();
            
            // Текст стикера
            if (sticker.text) {
                ctx.fillStyle = '#333';
                ctx.font = '13px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                
                // Перенос текста
                const padding = 8;
                const maxWidth = sticker.width - padding * 2;
                const lineHeight = 18;
                const words = sticker.text.split(' ');
                let line = '';
                let y = sticker.y + padding;
                
                for (let i = 0; i < words.length; i++) {
                    const testLine = line + words[i] + ' ';
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && i > 0) {
                        ctx.fillText(line.trim(), sticker.x + padding, y);
                        line = words[i] + ' ';
                        y += lineHeight;
                    } else {
                        line = testLine;
                    }
                }
                // Последняя строка
                if (line.trim()) {
                    ctx.fillText(line.trim(), sticker.x + padding, y);
                }
            }
            
            // Выделение
            if (sticker === this.selectedSticker || this.isSelected('sticker', sticker)) {
                ctx.strokeStyle = '#43b581';
                ctx.lineWidth = 3;
                ctx.strokeRect(sticker.x - 2, sticker.y - 2, sticker.width + 4, sticker.height + 4);
            }
            
            ctx.restore();
        });
    }
    
    // ========== ОТРИСОВКА РИСУНКОВ КАРАНДАШОМ ==========
    
    drawDrawings(ctx) {
        this.drawings.forEach(drawing => {
            ctx.save();
            const isDrawingSelected = drawing === this.selectedDrawing || this.isSelected('drawing', drawing);
            if (isDrawingSelected) {
                ctx.strokeStyle = '#43b581';
                ctx.lineWidth = drawing.width + 2;
            } else {
                ctx.strokeStyle = drawing.color;
                ctx.lineWidth = drawing.width;
            }
            ctx.setLineDash([]);
            ctx.beginPath();
            drawing.points.forEach((point, i) => {
                if (i === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            });
            ctx.stroke();
            ctx.restore();
        });
    }
    
    // Затемнение цвета
    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max((num >> 16) - amt, 0);
        const G = Math.max((num >> 8 & 0x00FF) - amt, 0);
        const B = Math.max((num & 0x0000FF) - amt, 0);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }
    
    getData() {
        return JSON.stringify({
            nodes: this.nodes,
            edges: this.edges,
            drawings: this.drawings,
            texts: this.texts,
            zones: this.zones,
            stickers: this.stickers,
            frames: this.frames,
            images: this.images.map(img => ({
                id: img.id,
                dataUrl: img.image.src,
                x: img.x,
                y: img.y,
                width: img.width,
                height: img.height
            }))
        });
    }
    
    setData(data) {
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            this.nodes = parsed.nodes || [];
            this.edges = parsed.edges || [];
            this.drawings = parsed.drawings || [];
            this.texts = parsed.texts || [];
            this.zones = parsed.zones || [];
            this.stickers = parsed.stickers || [];
            this.frames = parsed.frames || [];
            
            // Загружаем изображения
            this.images = [];
            if (parsed.images) {
                parsed.images.forEach(imgData => {
                    const img = new Image();
                    img.onload = () => {
                        this.images.push({
                            id: imgData.id,
                            image: img,
                            x: imgData.x,
                            y: imgData.y,
                            width: imgData.width,
                            height: imgData.height
                        });
                        this.redraw();
                    };
                    img.src = imgData.dataUrl;
                });
            }
            
            this.redraw();
        } catch (e) {
            console.error('Ошибка загрузки данных canvas:', e);
        }
    }
    
    // ========== ПАЛИТРА ЦВЕТОВ ==========
    
    loadColorPalette() {
        try {
            const saved = localStorage.getItem('canvasColorPalette');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Ошибка загрузки палитры:', e);
        }
        // Стандартная палитра
        return ['#5865f2', '#57f287', '#fee75c', '#ed4245', '#eb459e', '#3498db', '#9b59b6', '#1abc9c'];
    }
    
    saveColorPalette() {
        try {
            localStorage.setItem('canvasColorPalette', JSON.stringify(this.colorPalette));
        } catch (e) {
            console.error('Ошибка сохранения палитры:', e);
        }
    }
    
    addColorToPalette(color) {
        if (!this.colorPalette.includes(color)) {
            this.colorPalette.push(color);
            this.saveColorPalette();
        }
    }
    
    removeColorFromPalette(color) {
        const idx = this.colorPalette.indexOf(color);
        if (idx > -1) {
            this.colorPalette.splice(idx, 1);
            this.saveColorPalette();
        }
    }
}
