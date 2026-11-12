(() => {
    const REQUEST_EVENT = 'artist-wallpaper:api-request';
    const RESPONSE_EVENT = 'artist-wallpaper:api-response';

    window.addEventListener(REQUEST_EVENT, async (event) => {
        const { id, artistName } = event.detail || {};
        if (!id || typeof artistName !== 'string' || !artistName) return;

        let authorId = null;
        try {
            const result = await window.kugouapi?.request?.(
                `/search?keywords=${encodeURIComponent(artistName)}&type=author`
            );
            if (result?.status === 200) {
                const lists = result.body?.data?.lists;
                authorId = lists?.[0]?.AuthorId || lists?.[0]?.author_id || null;
            }
        } catch (error) {
            console.warn('[ArtistWallpaper] 搜索歌手 ID 失败:', error);
        }

        window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
            detail: { id, authorId }
        }));
    });
})();
