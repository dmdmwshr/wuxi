// 全局变量
let personnelData = [];
let drawingResults = [];
let currentEditingPerson = null;
let currentZoom = 1;
const zoomStep = 0.1;
const maxZoom = 1.5;
const minZoom = 0.5;

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadSavedData();
    
    // 恢复保存的缩放级别
    const savedZoom = localStorage.getItem('pageZoom');
    if (savedZoom) {
        currentZoom = parseFloat(savedZoom);
        updateZoom();
    }
});

// 初始化事件监听器
function initializeEventListeners() {
    // 文件导入
    document.getElementById('importBtn').addEventListener('click', handleImport);
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    
    // 模板下载
    document.getElementById('templateBtn').addEventListener('click', downloadTemplate);
    
    // 导出结果
    document.getElementById('exportBtn').addEventListener('click', exportResults);
    
    // 抽签配置
    document.getElementById('addConfigBtn').addEventListener('click', addDrawingConfig);
    document.getElementById('drawBtn').addEventListener('click', startDrawing);
    
    // 筛选器事件
    document.getElementById('departmentFilter').addEventListener('change', filterPersonnel);
    document.getElementById('positionFilter').addEventListener('change', filterPersonnel);
    document.getElementById('statusFilter').addEventListener('change', filterPersonnel);
    document.getElementById('searchInput').addEventListener('input', filterPersonnel);
    
    // 状态修改模态框
    document.getElementById('saveStatus').addEventListener('click', savePersonStatus);
}

// 文件处理相关函数
function handleImport() {
    document.getElementById('fileInput').click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 检查文件类型
    const fileType = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(fileType)) {
        alert('请选择 Excel 文件（.xlsx 或 .xls）');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            if (jsonData.length === 0) {
                alert('Excel 文件中没有数据');
                return;
            }

            // 验证数据格式
            const requiredColumns = ['部门', '岗位', '姓名'];
            const firstRow = jsonData[0];
            const missingColumns = requiredColumns.filter(col => !(col in firstRow));
            
            if (missingColumns.length > 0) {
                alert(`Excel 文件缺少必要的列：${missingColumns.join(', ')}`);
                return;
            }

            processImportedData(jsonData);
            alert('数据导入成功！');
            event.target.value = ''; // 清空文件选择，允许重复导入同一文件
        } catch (error) {
            alert('文件解析失败，请确保文件格式正确');
            console.error('文件解析错误:', error);
        }
    };

    reader.onerror = function() {
        alert('文件读取失败，请重试');
    };

    reader.readAsArrayBuffer(file);
}

function processImportedData(data) {
    personnelData = data.map(row => ({
        department: row['部门']?.trim() || '',
        position: row['岗位']?.trim() || '',
        name: row['姓名']?.trim() || '',
        status: row['状态']?.trim() || '正常',
        remark: row['备注']?.trim() || ''
    })).filter(person => person.department && person.position && person.name); // 过滤掉无效数据
    
    updateFilters();
    renderPersonnelTable();
    updateDrawingConfigTable();
    saveDataToLocalStorage();
}

// 模板下载
function downloadTemplate() {
    const template = [
        {
            '部门': '示例部门',
            '岗位': '示例岗位',
            '姓名': '张三',
            '状态': '正常',
            '备注': ''
        }
    ];
    
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '人员名单');
    XLSX.writeFile(wb, '人员导入模板.xlsx');
}

// 导出结果
function exportResults() {
    const departments = [
        '安镇专职队',
        '新材料产业园专职队',
        '鹅湖专职队',
        '港下专职队',
        '羊尖专职队',
        '东北塘专职队'
    ];
    
    const positions = ['指挥员', '战斗员', '通信员', '驾驶员', '安全员'];
    
    // 准备导出数据
    const exportData = departments.map(dept => {
        const row = {
            '单位': dept
        };
        
        positions.forEach(pos => {
            const personnel = drawingResults.filter(r => 
                r.department === dept && r.position === pos
            ).map(r => r.name);
            
            row[pos] = personnel.join('、') || '-';
        });
        
        return row;
    });
    
    // 创建工作表
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '抽签结果');
    
    // 设置列宽
    const wscols = [
        {wch: 20}, // 单位列宽
        {wch: 15}, // 指挥员列宽
        {wch: 15}, // 战斗员列宽
        {wch: 15}, // 通信员列宽
        {wch: 15}, // 驾驶员列宽
        {wch: 15}  // 安全员列宽
    ];
    ws['!cols'] = wscols;
    
    // 导出文件
    XLSX.writeFile(wb, '抽签结果.xlsx');
}

// 抽签配置相关
function addDrawingConfig() {
    const configTable = document.getElementById('drawingConfigTable');
    const newRow = configTable.insertRow();
    newRow.innerHTML = `
        <td>
            <select class="form-select">
                ${getPositionOptions()}
            </select>
        </td>
        <td>
            <input type="number" class="form-control" min="1" value="1">
        </td>
        <td>
            <button class="btn btn-danger btn-sm" onclick="removeConfig(this)">删除</button>
        </td>
    `;
}

function removeConfig(button) {
    button.closest('tr').remove();
}

// 修改 HTML 中抽签配置表格的表头
function updateDrawingConfigTable() {
    const configTable = document.getElementById('drawingConfigTable');
    configTable.innerHTML = '';
    
    // 获取所有不重复的岗位
    const positions = [...new Set(personnelData.map(p => p.position))];
    
    // 为每个岗位自动创建一行配置
    positions.forEach(position => {
        const row = configTable.insertRow();
        row.innerHTML = `
            <td>${position}</td>
            <td>
                <input type="number" class="form-control" min="0" value="1">
            </td>
            <td>
                <div class="small text-muted">
                    ${getAvailableCount(position)}
                </div>
            </td>
        `;
    });
}

// 获取指定岗位的可用人数
function getAvailableCount(position) {
    const departmentCounts = {};
    personnelData.forEach(person => {
        if (person.position === position && person.status === '正常') {
            if (!departmentCounts[person.department]) {
                departmentCounts[person.department] = 0;
            }
            departmentCounts[person.department]++;
        }
    });
    
    // 返回各部门的可用人数信息
    return Object.entries(departmentCounts)
        .map(([dept, count]) => `${dept}: ${count}人`)
        .join(', ');
}

// 修改抽签逻辑
function startDrawing() {
    drawingResults = [];
    const configs = getDrawingConfigs();
    
    // 获取所有固定的部门列表
    const departments = [
        '安镇专职队',
        '新材料产业园专职队',
        '鹅湖专职队',
        '港下专职队',
        '羊尖专职队',
        '东北塘专职队'
    ];
    
    // 对每个部门进行抽签
    departments.forEach(department => {
        // 对每个岗位配置进行抽签
        configs.forEach(config => {
            // 筛选当前部门下指定岗位的可用人员
            const eligiblePersonnel = personnelData.filter(person => 
                person.department === department &&
                person.position === config.position &&
                person.status === '正常'
            );
            
            let actualDrawCount = Math.min(config.count, eligiblePersonnel.length);
            
            if (actualDrawCount > 0) {
                // Fisher-Yates 洗牌算法
                const shuffled = [...eligiblePersonnel];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                
                // 选取可用的人员
                for (let i = 0; i < actualDrawCount; i++) {
                    drawingResults.push({
                        department: department,
                        position: config.position,
                        name: shuffled[i].name,
                        drawNumber: i + 1,
                        drawTime: new Date().toLocaleString()
                    });
                }
                
                // 如果实际抽取人数少于配置人数，显示提示信息
                if (actualDrawCount < config.count) {
                    console.warn(`${department}的${config.position}岗位可用人员不足，需要${config.count}人，实际仅抽取${actualDrawCount}人`);
                    // 可以选择是否显示提示框
                    // alert(`${department}的${config.position}岗位可用人员不足，需要${config.count}人，实际仅抽取${actualDrawCount}人`);
                }
            }
        });
    });
    
    renderDrawingResults();
    saveDataToLocalStorage();
}

// 修改渲染结果函数，添加提示信息
function renderDrawingResults() {
    const tbody = document.getElementById('drawingResultsTable');
    tbody.innerHTML = '';
    
    const departments = [
        '安镇专职队',
        '新材料产业园专职队',
        '鹅湖专职队',
        '港下专职队',
        '羊尖专职队',
        '东北塘专职队'
    ];
    
    const positions = ['指挥员', '战斗员', '通信员', '驾驶员', '安全员'];
    
    // 按部门和岗位对结果进行分组
    const resultMap = {};
    departments.forEach(dept => {
        resultMap[dept] = {};
        positions.forEach(pos => {
            resultMap[dept][pos] = [];
        });
    });
    
    // 将抽签结果填入对应位置
    drawingResults.forEach(result => {
        if (resultMap[result.department] && resultMap[result.department][result.position]) {
            resultMap[result.department][result.position].push(result.name);
        }
    });
    
    // 渲染结果表格
    departments.forEach(dept => {
        const row = tbody.insertRow();
        // 添加部门名称
        row.insertCell().textContent = dept;
        
        // 添加各岗位人员
        positions.forEach(pos => {
            const cell = row.insertCell();
            const names = resultMap[dept][pos];
            if (names.length > 0) {
                cell.textContent = names.join('、');
                // 添加提示信息，表明是否为不足人数的自动选择
                const requiredCount = getRequiredCount(pos);
                if (names.length < requiredCount) {
                    cell.title = `应抽取${requiredCount}人，实际仅有${names.length}人可用`;
                    cell.style.backgroundColor = '#fff7e6'; // 添加轻微的背景色以示区分
                }
            } else {
                cell.textContent = '-';
            }
        });
    });
}

// 获取岗位要求的抽取人数
function getRequiredCount(position) {
    const configs = getDrawingConfigs();
    const config = configs.find(c => c.position === position);
    return config ? config.count : 0;
}

// 状态管理
function editPersonStatus(name) {
    currentEditingPerson = personnelData.find(p => p.name === name);
    if (currentEditingPerson) {
        document.getElementById('statusSelect').value = currentEditingPerson.status;
        document.getElementById('statusRemark').value = currentEditingPerson.remark || '';
        new bootstrap.Modal(document.getElementById('statusModal')).show();
    }
}

function savePersonStatus() {
    if (currentEditingPerson) {
        currentEditingPerson.status = document.getElementById('statusSelect').value;
        currentEditingPerson.remark = document.getElementById('statusRemark').value;
        
        bootstrap.Modal.getInstance(document.getElementById('statusModal')).hide();
        renderPersonnelTable();
        saveDataToLocalStorage();
    }
}

// 辅助函数
function getStatusClass(status) {
    switch (status) {
        case '正常': return 'normal';
        case '休假': return 'vacation';
        case '伤病': return 'sick';
        default: return 'normal';
    }
}

function updateFilters() {
    const departments = [...new Set(personnelData.map(p => p.department))];
    const positions = [...new Set(personnelData.map(p => p.position))];
    
    const departmentFilter = document.getElementById('departmentFilter');
    const positionFilter = document.getElementById('positionFilter');
    
    departmentFilter.innerHTML = '<option value="">全部部门</option>' +
        departments.map(d => `<option value="${d}">${d}</option>`).join('');
    
    positionFilter.innerHTML = '<option value="">全部岗位</option>' +
        positions.map(p => `<option value="${p}">${p}</option>`).join('');
}

// 渲染人员表格
function renderPersonnelTable(filteredData = personnelData) {
    const ctx = document.getElementById('personnelChart').getContext('2d');
    
    // 按部门和状态统计人数
    const departmentData = {};
    const departments = [...new Set(filteredData.map(p => p.department))];
    const statuses = ['正常', '休假', '伤病'];
    
    departments.forEach(dept => {
        departmentData[dept] = {
            '正常': 0,
            '休假': 0,
            '伤病': 0
        };
    });
    
    filteredData.forEach(person => {
        departmentData[person.department][person.status]++;
    });
    
    // 准备图表数据
    const datasets = statuses.map((status, index) => ({
        label: status,
        data: departments.map(dept => departmentData[dept][status]),
        backgroundColor: status === '正常' ? '#1890FF' : 
                        status === '休假' ? '#faad14' : '#ff7875',
        borderColor: status === '正常' ? '#003A8C' : 
                    status === '休假' ? '#d48806' : '#d32029',
        borderWidth: 1,
        borderRadius: 5,
    }));

    // 销毁现有图表（如果存在）
    if (window.personnelChart instanceof Chart) {
        window.personnelChart.destroy();
    }
    
    // 创建新图表
    window.personnelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: departments,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '各部门人员状态统计',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    position: 'top'
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false
                },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    formatter: function(value) {
                        return value || '';
                    },
                    color: '#666',
                    font: {
                        weight: 'bold'
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            }
        },
        plugins: [{
            afterDraw: function(chart) {
                var ctx = chart.ctx;
                chart.data.datasets.forEach(function(dataset, i) {
                    var meta = chart.getDatasetMeta(i);
                    meta.data.forEach(function(bar, index) {
                        var data = dataset.data[index];
                        if(data !== 0) {
                            ctx.fillStyle = '#666';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            ctx.fillText(data, bar.x, bar.y - 5);
                        }
                    });
                });
            }
        }]
    });
}

// 修改筛选函数以支持图表更新
function filterPersonnel() {
    const department = document.getElementById('departmentFilter').value;
    const position = document.getElementById('positionFilter').value;
    const status = document.getElementById('statusFilter').value;
    const search = document.getElementById('searchInput').value.toLowerCase();
    
    const filtered = personnelData.filter(person => 
        (!department || person.department === department) &&
        (!position || person.position === position) &&
        (!status || person.status === status) &&
        (!search || 
            person.name.toLowerCase().includes(search) ||
            person.department.toLowerCase().includes(search) ||
            person.position.toLowerCase().includes(search)
        )
    );
    
    renderPersonnelTable(filtered);
}

// 数据持久化
function saveDataToLocalStorage() {
    localStorage.setItem('personnelData', JSON.stringify(personnelData));
    localStorage.setItem('drawingResults', JSON.stringify(drawingResults));
}

function loadSavedData() {
    const savedPersonnelData = localStorage.getItem('personnelData');
    const savedDrawingResults = localStorage.getItem('drawingResults');
    
    if (savedPersonnelData) {
        personnelData = JSON.parse(savedPersonnelData);
        updateFilters();
        renderPersonnelTable();
    }
    
    if (savedDrawingResults) {
        drawingResults = JSON.parse(savedDrawingResults);
        renderDrawingResults();
    }
}

// 工具函数
function getDepartmentOptions() {
    const departments = [...new Set(personnelData.map(p => p.department))];
    return departments.map(d => `<option value="${d}">${d}</option>`).join('');
}

function getPositionOptions() {
    const positions = [...new Set(personnelData.map(p => p.position))];
    return positions.map(p => `<option value="${p}">${p}</option>`).join('');
}

function getDrawingConfigs() {
    const configs = [];
    const rows = document.getElementById('drawingConfigTable').getElementsByTagName('tr');
    
    for (const row of rows) {
        const position = row.cells[0].textContent;
        const count = parseInt(row.querySelector('input[type="number"]').value, 10);
        
        if (count > 0) {  // 只添加需要抽签的岗位
            configs.push({
                position: position,
                count: count
            });
        }
    }
    
    return configs;
}

function updateZoom() {
    document.querySelector('.container-fluid').style.transform = `scale(${currentZoom})`;
    document.querySelector('.zoom-level').textContent = `${Math.round(currentZoom * 100)}%`;
    
    // 保存当前缩放级别到 localStorage
    localStorage.setItem('pageZoom', currentZoom);
}

function zoomIn() {
    if (currentZoom < maxZoom) {
        currentZoom += zoomStep;
        updateZoom();
    }
}

function zoomOut() {
    if (currentZoom > minZoom) {
        currentZoom -= zoomStep;
        updateZoom();
    }
}

function resetZoom() {
    currentZoom = 1;
    updateZoom();
}

// 添加键盘快捷键支持
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
            e.preventDefault();
            zoomIn();
        } else if (e.key === '-') {
            e.preventDefault();
            zoomOut();
        } else if (e.key === '0') {
            e.preventDefault();
            resetZoom();
        }
    }
});