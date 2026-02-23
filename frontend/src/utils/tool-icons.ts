/**
 * Tool Icons Utility
 * Maps tool names and match types to icons for better UI display
 */

// Tool name to icon mapping
export const toolIcons: Record<string, string> = {
    multi_kb_search: '🔍',
    knowledge_search: '📚',
    grep_chunks: '🔎',
    get_chunk_detail: '📄',
    list_knowledge_bases: '📂',
    list_knowledge_chunks: '🧩',
    get_document_info: 'ℹ️',
    query_knowledge_graph: '🕸️',
    think: '💭',
    todo_write: '📋',
};

// Match type to icon mapping
export const matchTypeIcons: Record<string, string> = {
    // 원문: 向量匹配
    '벡터 매칭': '🎯',
    '\u5411\u91cf\u5339\u914d': '🎯',
    // 원문: 关键词匹配
    '키워드 매칭': '🔤',
    '\u5173\u952e\u8bcd\u5339\u914d': '🔤',
    // 원문: 相邻块匹配
    '인접 청크 매칭': '📌',
    '\u76f8\u90bb\u5757\u5339\u914d': '📌',
    // 원문: 历史匹配
    '이력 매칭': '📜',
    '\u5386\u53f2\u5339\u914d': '📜',
    // 원문: 父块匹配
    '상위 청크 매칭': '⬆️',
    '\u7236\u5757\u5339\u914d': '⬆️',
    // 원문: 关系块匹配
    '관계 청크 매칭': '🔗',
    '\u5173\u7cfb\u5757\u5339\u914d': '🔗',
    // 원문: 图谱匹配
    '그래프 매칭': '🕸️',
    '\u56fe\u8c31\u5339\u914d': '🕸️',
};

// Get icon for a tool name
export function getToolIcon(toolName: string): string {
    return toolIcons[toolName] || '🛠️';
}

// Get icon for a match type
export function getMatchTypeIcon(matchType: string): string {
    return matchTypeIcons[matchType] || '📍';
}

// Get tool display name (user-friendly)
export function getToolDisplayName(toolName: string): string {
    const displayNames: Record<string, string> = {
        multi_kb_search: /* 원문: 跨库搜索 */ '다중 지식 베이스 검색',
        knowledge_search: /* 원문: 知识库搜索 */ '지식 베이스 검색',
        grep_chunks: /* 원문: 文本模式搜索 */ '텍스트 패턴 검색',
        get_chunk_detail: /* 원문: 获取片段详情 */ '청크 상세 조회',
        list_knowledge_chunks: /* 원문: 查看知识分块 */ '지식 청크 보기',
        list_knowledge_bases: /* 원문: 列出知识库 */ '지식 베이스 목록',
        get_document_info: /* 원문: 获取文档信息 */ '문서 정보 조회',
        query_knowledge_graph: /* 원문: 查询知识图谱 */ '지식 그래프 질의',
        think: /* 원문: 深度思考 */ '심층 사고',
        todo_write: /* 원문: 制定计划 */ '계획 수립',
    };
    return displayNames[toolName] || toolName;
}
