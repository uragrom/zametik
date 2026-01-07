// Красивый граф заметок с градиентами и анимацией
class GraphView {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.edges = [];
        this.filteredNodes = [];
        this.filteredEdges = [];
        
        // Параметры анимации
        this.animationId = null;
        this.isAnimating = false;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.lastMousePos = { x: 0, y: 0 };
        this.hoveredNode = null;
        this.time = 0;
        
        // Физика
        this.velocity = new Map();
        this.targetPositions = new Map();
        this.linkGroups = new Map();
        this.currentFilter = 'all';
        
        // События
        this.onNodeClick = null;
        
        // Цвета
        this.colors = {
            node1: '#6366f1',  // Индиго
            node2: '#8b5cf6',  // Фиолетовый
            canvas: '#f59e0b', // Оранжевый
            canvasGlow: '#fbbf24',
            edge: '#818cf8',
            edgeGlow: '#a5b4fc',
            background: 'rgba(17, 24, 39, 0.02)'
        };
        
        this.init();
    }
    
    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Обработчики мыши
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Обработчики касаний
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));
    }
    
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.redraw();
    }
    
    setData(data) {
        // Поддержка как {notes, links} так и {nodes, edges}
        this.nodes = data.nodes || data.notes || [];
        this.edges = data.edges || data.links || [];
        this.linkGroups = new Map();
        this.initializePositions();
        this.currentFilter = 'all';
        this.applyFilter('all');
        this.startAnimation();
    }
    
    initializePositions() {
        if (this.nodes.length === 0) return;
        
        const centerX = this.canvas.width / (2 * window.devicePixelRatio);
        const centerY = this.canvas.height / (2 * window.devicePixelRatio);
        
        // Находим группы связанных заметок
        this.linkGroups = this.findLinkGroups();
        
        this.nodes.forEach((node, i) => {
            const angle = (i / this.nodes.length) * Math.PI * 2;
            const radius = Math.min(centerX, centerY) * 0.6;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            node.x = x;
            node.y = y;
            node.vx = 0;
            node.vy = 0;
            
            // Параметры для кружения
            node.centerX = x;
            node.centerY = y;
            node.circleRadius = 8 + Math.random() * 12;
            node.circleAngle = Math.random() * Math.PI * 2;
            node.circleSpeed = 0.003 + Math.random() * 0.004;
            node.pulsePhase = Math.random() * Math.PI * 2;
            node.groupId = null;
            
            this.velocity.set(node.id, { vx: 0, vy: 0 });
            this.targetPositions.set(node.id, { x, y });
        });
        
        // Назначаем группы и синхронизируем параметры связанных узлов
        this.syncLinkedNodes();
    }
    
    findLinkGroups() {
        // Union-Find для группировки связанных заметок
        const parent = {};
        const groups = new Map();
        
        this.nodes.forEach(n => parent[n.id] = n.id);
        
        const find = (x) => {
            if (parent[x] !== x) parent[x] = find(parent[x]);
            return parent[x];
        };
        
        const union = (a, b) => {
            const rootA = find(a);
            const rootB = find(b);
            if (rootA !== rootB) parent[rootA] = rootB;
        };
        
        this.edges.forEach(edge => {
            union(edge.source, edge.target);
        });
        
        // Группируем по корню
        this.nodes.forEach(n => {
            const root = find(n.id);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(n.id);
        });
        
        return groups;
    }
    
    syncLinkedNodes() {
        // Для каждой группы связанных узлов - синхронизируем орбиту
        let groupIdx = 0;
        const canvasCenterX = this.canvas.width / (2 * window.devicePixelRatio);
        const canvasCenterY = this.canvas.height / (2 * window.devicePixelRatio);
        
        this.linkGroups.forEach((nodeIds, groupRoot) => {
            if (nodeIds.length <= 1) return;
            
            // Общие параметры группы
            const groupSpeed = 0.002 + Math.random() * 0.002;
            const baseAngle = Math.random() * Math.PI * 2;
            
            // Группа вращается вокруг своего центра
            const groupOrbitAngle = groupIdx * (Math.PI * 2 / Math.max(this.linkGroups.size, 1));
            const groupDistance = 80 + groupIdx * 50;
            const groupCenterX = canvasCenterX + Math.cos(groupOrbitAngle) * groupDistance;
            const groupCenterY = canvasCenterY + Math.sin(groupOrbitAngle) * groupDistance;
            
            nodeIds.forEach((nodeId, idx) => {
                const node = this.nodes.find(n => n.id === nodeId);
                if (!node) return;
                
                node.groupId = groupRoot;
                node.groupSpeed = groupSpeed;
                node.groupBaseAngle = baseAngle;
                
                // Узлы группы распределены по кругу вокруг центра группы
                // Но все крутятся синхронно
                const nodeAngleInGroup = (idx / nodeIds.length) * Math.PI * 2;
                node.nodeAngleOffset = nodeAngleInGroup;
                
                // Расстояние от центра группы до узла
                const nodeDistance = 40 + nodeIds.length * 10;
                node.groupCenterX = groupCenterX;
                node.groupCenterY = groupCenterY;
                node.nodeDistanceFromGroup = nodeDistance;
                
                // Начальная позиция
                node.centerX = groupCenterX + Math.cos(baseAngle + nodeAngleInGroup) * nodeDistance;
                node.centerY = groupCenterY + Math.sin(baseAngle + nodeAngleInGroup) * nodeDistance;
                node.x = node.centerX;
                node.y = node.centerY;
            });
            
            groupIdx++;
        });
    }
    
    applyFilter(filter) {
        this.currentFilter = filter;
        
        if (filter === 'all') {
            this.filteredNodes = [...this.nodes];
            this.filteredEdges = [...this.edges];
        } else if (filter === 'linked') {
            const linkedNodeIds = new Set();
            this.edges.forEach(edge => {
                linkedNodeIds.add(edge.source);
                linkedNodeIds.add(edge.target);
            });
            
            this.filteredNodes = this.nodes.filter(node => linkedNodeIds.has(node.id));
            this.filteredEdges = this.edges.filter(edge => 
                linkedNodeIds.has(edge.source) && linkedNodeIds.has(edge.target)
            );
        }
        
        this.redraw();
    }
    
    startAnimation() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.animate();
    }
    
    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
    
    animate() {
        if (!this.isAnimating) return;
        
        this.time += 0.016;
        this.updatePhysics();
        this.redraw();
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    updatePhysics() {
        if (this.filteredNodes.length === 0) return;
        
        const centerX = this.canvas.width / (2 * window.devicePixelRatio);
        const centerY = this.canvas.height / (2 * window.devicePixelRatio);
        const minDistance = 50; // Минимальное расстояние между точками
        
        // Обновляем базовый угол для каждой группы
        this.linkGroups.forEach((nodeIds, groupRoot) => {
            if (nodeIds.length <= 1) return;
            
            const firstNode = this.nodes.find(n => n.id === nodeIds[0]);
            if (!firstNode || !firstNode.groupSpeed) return;
            
            // Увеличиваем базовый угол группы
            const newBaseAngle = (firstNode.groupBaseAngle || 0) + firstNode.groupSpeed;
            
            // Обновляем все узлы группы
            nodeIds.forEach(nodeId => {
                const node = this.filteredNodes.find(n => n.id === nodeId);
                if (!node) return;
                
                node.groupBaseAngle = newBaseAngle;
                
                // Пересчитываем позицию центра узла на орбите группы
                if (node.nodeDistanceFromGroup !== undefined) {
                    const totalAngle = newBaseAngle + node.nodeAngleOffset;
                    node.centerX = node.groupCenterX + Math.cos(totalAngle) * node.nodeDistanceFromGroup;
                    node.centerY = node.groupCenterY + Math.sin(totalAngle) * node.nodeDistanceFromGroup;
                }
            });
        });
        
        this.filteredNodes.forEach(node => {
            // Медленное кружение вокруг центра
            if (!node.groupId) {
                // Для одиночных - индивидуальное кружение
                node.circleAngle += node.circleSpeed;
            }
            
            const offsetX = Math.cos(node.circleAngle) * node.circleRadius;
            const offsetY = Math.sin(node.circleAngle) * node.circleRadius;
            
            let targetX = node.centerX + offsetX;
            let targetY = node.centerY + offsetY;
            
            node.x += (targetX - node.x) * 0.05;
            node.y += (targetY - node.y) * 0.05;
            
            // Центрирующая сила только для одиночных узлов
            if (!node.groupId) {
                const centerDx = centerX - node.centerX;
                const centerDy = centerY - node.centerY;
                node.centerX += centerDx * 0.0001;
                node.centerY += centerDy * 0.0001;
            }
        });
        
        // Отталкивание если точки слишком близко (только для разных групп)
        for (let i = 0; i < this.filteredNodes.length; i++) {
            for (let j = i + 1; j < this.filteredNodes.length; j++) {
                const nodeA = this.filteredNodes[i];
                const nodeB = this.filteredNodes[j];
                
                // Узлы одной группы не отталкиваются
                if (nodeA.groupId && nodeA.groupId === nodeB.groupId) continue;
                
                const dx = nodeB.x - nodeA.x;
                const dy = nodeB.y - nodeA.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < minDistance && dist > 0) {
                    const force = (minDistance - dist) * 0.02;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    
                    if (!nodeA.groupId) {
                        nodeA.centerX -= nx * force;
                        nodeA.centerY -= ny * force;
                    }
                    if (!nodeB.groupId) {
                        nodeB.centerX += nx * force;
                        nodeB.centerY += ny * force;
                    }
                }
            }
        }
    }
    
    screenToCanvas(x, y) {
        return {
            x: (x - this.panX) / this.zoom,
            y: (y - this.panY) / this.zoom
        };
    }
    
    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.lastMousePos = { x, y };
        this.panStart = { x: this.panX, y: this.panY };
        
        if (e.button === 0) {
            const canvasPos = this.screenToCanvas(x, y);
            const node = this.getNodeAt(canvasPos.x, canvasPos.y);
            
            if (node) {
                if (this.onNodeClick) {
                    this.onNodeClick(node.id);
                }
            } else {
                this.isPanning = true;
            }
        }
    }
    
    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.isPanning) {
            this.panX += x - this.lastMousePos.x;
            this.panY += y - this.lastMousePos.y;
        }
        
        // Проверяем hover
        const canvasPos = this.screenToCanvas(x, y);
        this.hoveredNode = this.getNodeAt(canvasPos.x, canvasPos.y);
        this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
        
        this.lastMousePos = { x, y };
    }
    
    onMouseUp(e) {
        this.isPanning = false;
    }
    
    onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.3, Math.min(4, this.zoom * zoomFactor));
        
        const scaleDiff = newZoom / this.zoom;
        this.panX = x - (x - this.panX) * scaleDiff;
        this.panY = y - (y - this.panY) * scaleDiff;
        this.zoom = newZoom;
    }
    
    onTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.lastMousePos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
            this.panStart = { ...this.lastMousePos };
        }
    }
    
    onTouchMove(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            this.panX += x - this.lastMousePos.x;
            this.panY += y - this.lastMousePos.y;
            
            this.lastMousePos = { x, y };
        }
    }
    
    onTouchEnd(e) {}
    
    getNodeAt(x, y) {
        const nodeRadius = 12;
        for (let i = this.filteredNodes.length - 1; i >= 0; i--) {
            const node = this.filteredNodes[i];
            const dx = x - node.x;
            const dy = y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= nodeRadius) {
                return node;
            }
        }
        return null;
    }
    
    setZoom(level) {
        this.zoom = Math.max(0.3, Math.min(4, level));
    }
    
    resetView() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
    }
    
    redraw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Полная очистка canvas (без остаточных следов)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        
        // Возвращаем scale для devicePixelRatio
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const displayWidth = width / window.devicePixelRatio;
        const displayHeight = height / window.devicePixelRatio;
        
        ctx.save();
        ctx.translate(this.panX, this.panY);
        ctx.scale(this.zoom, this.zoom);
        
        // Рисуем связи с градиентом и свечением
        this.drawEdges(ctx);
        
        // Рисуем узлы
        this.drawNodes(ctx);
        
        ctx.restore();
    }
    
    drawEdges(ctx) {
        const pulseIntensity = 0.5 + Math.sin(this.time * 2) * 0.3;
        
        this.filteredEdges.forEach(edge => {
            const source = this.filteredNodes.find(n => n.id === edge.source);
            const target = this.filteredNodes.find(n => n.id === edge.target);
            
            if (!source || !target) return;
            
            // Градиентная линия
            const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
            gradient.addColorStop(0, `rgba(99, 102, 241, ${0.4 * pulseIntensity})`);
            gradient.addColorStop(0.5, `rgba(139, 92, 246, ${0.6 * pulseIntensity})`);
            gradient.addColorStop(1, `rgba(99, 102, 241, ${0.4 * pulseIntensity})`);
            
            // Свечение
            ctx.shadowColor = this.colors.edgeGlow;
            ctx.shadowBlur = 8;
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
            
            ctx.shadowBlur = 0;
        });
    }
    
    drawNodes(ctx) {
        this.filteredNodes.forEach(node => {
            const isHovered = this.hoveredNode === node;
            const baseRadius = isHovered ? 14 : 10;
            const pulse = Math.sin(this.time * 3 + node.pulsePhase) * 0.1 + 1;
            const radius = baseRadius * pulse;
            
            const isCanvas = node.type === 'canvas';
            const color1 = isCanvas ? '#f59e0b' : '#6366f1';
            const color2 = isCanvas ? '#fbbf24' : '#8b5cf6';
            const glowColor = isCanvas ? 'rgba(251, 191, 36, 0.6)' : 'rgba(139, 92, 246, 0.6)';
            
            // Ореол
            if (isHovered) {
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = 25;
            } else {
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = 12;
            }
            
            // Градиентный узел
            const gradient = ctx.createRadialGradient(
                node.x - radius * 0.3, node.y - radius * 0.3, 0,
                node.x, node.y, radius
            );
            gradient.addColorStop(0, color2);
            gradient.addColorStop(0.7, color1);
            gradient.addColorStop(1, isCanvas ? '#d97706' : '#4f46e5');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Блик
            ctx.shadowBlur = 0;
            const highlightGradient = ctx.createRadialGradient(
                node.x - radius * 0.3, node.y - radius * 0.3, 0,
                node.x - radius * 0.3, node.y - radius * 0.3, radius * 0.5
            );
            highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = highlightGradient;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Название при наведении или приближении
            if (isHovered || this.zoom > 1.2) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 4;
                ctx.fillStyle = '#ffffff';
                ctx.font = `${isHovered ? 'bold ' : ''}${isHovered ? '13' : '11'}px "Segoe UI", sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                
                // Фон для текста
                const textWidth = ctx.measureText(node.title).width;
                ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
                ctx.beginPath();
                ctx.roundRect(node.x + radius + 6, node.y - 10, textWidth + 12, 20, 4);
                ctx.fill();
                
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#f3f4f6';
                ctx.fillText(node.title, node.x + radius + 12, node.y);
            }
        });
    }
}
