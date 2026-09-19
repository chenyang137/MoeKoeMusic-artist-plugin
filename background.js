/**
 * 歌手写真轮播插件 - Background Service Worker
 * 负责处理与 Electron 主进程的 IPC 通信
 */

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FETCH_ARTIST_WALLPAPER') {
        // 转发请求到 Electron 主进程
        fetchArtistWallpaper(message.artistId, message.artistName)
            .then(result => {
                sendResponse({ success: true, data: result });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // 保持消息通道开放用于异步响应
    }
    
    if (message.type === 'SEARCH_ARTIST_ID') {
        // 搜索歌手 ID
        searchArtistId(message.artistName)
            .then(result => {
                sendResponse({ success: true, data: result });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (message.type === 'DOWNLOAD_IMAGE') {
        // 抓取远程图片并转 base64，供 content script 触发下载
        fetchImageAsDataUrl(message.url)
            .then(dataUrl => {
                sendResponse({ success: true, dataUrl: dataUrl });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});

/**
 * 抓取远程图片并转换为 base64 DataURL（用于跨域下载）
 * @param {string} url - 图片 URL
 * @returns {Promise<string>}
 */
async function fetchImageAsDataUrl(url) {
    if (!url) throw new Error('缺少图片 URL');

    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 分块拼接，避免大字符串栈溢出
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    const mime = blob.type || 'image/jpeg';
    return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * 获取歌手写真图片
 * @param {string} artistId - 歌手 ID
 * @param {string} artistName - 歌手名称
 * @returns {Promise<string[]>} - 写真图片 URL 数组
 */
async function fetchArtistWallpaper(artistId, artistName) {
    if (!artistId) {
        return [];
    }
    
    const apiUrl = `https://openapicdnretry.kugou.com/kmr/v1/author/extend?fields_pack=allimages&authorimg_type=2,3&entity_id=${artistId}`;
    
    try {
        const response = await fetch(apiUrl);
        const text = await response.text();
        const data = JSON.parse(text);
        
        if (data.status === 1 && data.data && data.data.length > 0 && data.data[0].imgs && data.data[0].imgs.length > 0) {
            // 返回所有写真图片 URL
            return data.data[0].imgs.map(img => img.file);
        } else {
            return [];
        }
    } catch (error) {
        console.error('[ArtistWallpaper] 获取歌手写真失败:', error);
        return [];
    }
}

/**
 * 通过搜索 API 获取歌手 ID
 * @param {string} artistName - 歌手名称
 * @returns {Promise<string|null>} - 歌手 ID
 */
async function searchArtistId(artistName) {
    if (!artistName) {
        return null;
    }
    
    const searchUrl = `http://127.0.0.1:6521/search?keywords=${encodeURIComponent(artistName)}&type=author`;
    
    try {
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
            return null;
        }
        
        const text = await response.text();
        const data = JSON.parse(text);
        
        // 检查数据结构：API 返回 data.lists 数组
        if (data.status === 1 && data.data && data.data.lists && data.data.lists.length > 0) {
            const authorId = data.data.lists[0].AuthorId;
            return authorId;
        }
    } catch (error) {
        console.error('[ArtistWallpaper] 搜索歌手 ID 失败:', error);
    }
    
    return null;
}

console.log('[ArtistWallpaper] Background service worker initialized');
