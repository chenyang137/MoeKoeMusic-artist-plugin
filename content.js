/**
 * 歌手写真轮播插件 - Content Script
 * 注入到播放器页面，实现写真轮播功能
 */

(function() {
    'use strict';

    // 写真轮播状态
    const state = {
        artistBackgroundImages: [],
        currentBackgroundIndex: 0,
        backgroundRotationTimer: null,
        backgroundImage1: null,
        backgroundImage2: null,
        activeLayer: 1,
        rotationInterval: 10000, // 10 秒轮播
        isInitialized: false,
        observer: null,
        checkInterval: null,
        isFetchingWallpaper: false, // 防止并发请求
        isTransitioning: false, // 防止并发切换
        currentSongHash: null // 当前正在处理的歌曲 hash
    };

    /**
     * 更新背景图层的辅助函数
     * @param {string} imageSrc - 图片 URL
     */
    function updateBackgroundLayer(imageSrc) {
        if (!imageSrc) return;

        const layer1 = document.getElementById('wallpaper-layer-1');
        const layer2 = document.getElementById('wallpaper-layer-2');
        
        if (!layer1 || !layer2) return;

        if (state.activeLayer === 1) {
            // 当前是图层 1，更新图层 2 并切换到图层 2
            layer2.style.backgroundImage = `url(${imageSrc})`;
            state.backgroundImage2 = imageSrc;
            requestAnimationFrame(() => {
                state.activeLayer = 2;
                layer1.style.opacity = '0';
                layer2.style.opacity = '1';
            });
        } else {
            // 当前是图层 2，更新图层 1 并切换到图层 1
            layer1.style.backgroundImage = `url(${imageSrc})`;
            state.backgroundImage1 = imageSrc;
            requestAnimationFrame(() => {
                state.activeLayer = 1;
                layer2.style.opacity = '0';
                layer1.style.opacity = '1';
            });
        }
    }

    /**
     * 清除背景图层缓存
     */
    function clearBackgroundLayers() {
        const layer1 = document.getElementById('wallpaper-layer-1');
        const layer2 = document.getElementById('wallpaper-layer-2');
        
        if (!layer1 || !layer2) return;
        
        // 清除两个图层的背景图片
        layer1.style.backgroundImage = 'none';
        layer2.style.backgroundImage = 'none';
        layer1.style.opacity = '0';
        layer2.style.opacity = '0';
    }

    /**
     * 初始化双缓冲背景图层
     */
    function initBackgroundLayers() {
        const lyricsScreen = document.querySelector('.lyrics-screen');
        if (!lyricsScreen) return;

        // 检查是否已存在背景图层
        if (document.getElementById('wallpaper-layer-1')) return;

        // 创建背景容器
        const bgContainer = document.createElement('div');
        bgContainer.id = 'wallpaper-container';
        bgContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            z-index: 0;
        `;

        // 创建背景图层 1
        const layer1 = document.createElement('div');
        layer1.id = 'wallpaper-layer-1';
        layer1.className = 'bg-layer wallpaper-layer';
        layer1.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-size: cover;
            background-position: center;
            transition: opacity 1s ease-in-out;
            opacity: 1;
        `;

        // 创建背景图层 2
        const layer2 = document.createElement('div');
        layer2.id = 'wallpaper-layer-2';
        layer2.className = 'bg-layer wallpaper-layer';
        layer2.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-size: cover;
            background-position: center;
            transition: opacity 1s ease-in-out;
            opacity: 0;
        `;

        // 添加到容器
        bgContainer.appendChild(layer1);
        bgContainer.appendChild(layer2);
        
        // 插入到 lyrics-screen 的最前面
        lyricsScreen.insertBefore(bgContainer, lyricsScreen.firstChild);
    }

    /**
     * 清除轮播定时器
     */
    function clearRotationTimer() {
        if (state.backgroundRotationTimer) {
            clearInterval(state.backgroundRotationTimer);
            state.backgroundRotationTimer = null;
        }
    }

    /**
     * 启动写真轮播
     * @param {string[]} images - 写真图片 URL 数组
     */
    function startRotation(images) {
        // 立即清除所有状态和定时器
        clearRotationTimer();
        state.isTransitioning = false;
        
        if (!images || images.length === 0) return;

        // 保存当前歌曲 hash 到闭包中，用于定时器验证
        const currentSongHashForRotation = state.currentSongHash;

        // 重置所有状态，防止上一首歌的数据污染
        state.artistBackgroundImages = [...images]; // 复制数组
        state.currentBackgroundIndex = 0;
        state.backgroundImage1 = null;
        state.backgroundImage2 = null;
        state.activeLayer = 1;

        // 只有一张图片时，不轮播
        if (images.length === 1) {
            updateBackgroundLayer(images[0]);
            return;
        }

        // 找到第一张与 images[0] 不同的图片作为第二张
        let secondImageIndex = -1;
        for (let i = 1; i < images.length; i++) {
            if (images[i] !== images[0]) {
                secondImageIndex = i;
                break;
            }
        }
        
        // 如果所有图片都相同，只使用一张图片，不轮播
        if (secondImageIndex === -1) {
            updateBackgroundLayer(images[0]);
            return;
        }

        // 预加载前两张图片，确保它们都加载完成后再显示
        const img1 = new Image();
        img1.src = images[0];
        
        const img2 = new Image();
        img2.src = images[secondImageIndex];
        
        let loadedCount = 0;
        let errorCount = 0;
        const totalImages = 2;
        
        const checkReady = () => {
            // 检查是否所有图片都已处理（加载成功或失败）
            if (loadedCount + errorCount >= totalImages) {
                // 至少有一张图片加载成功才能启动轮播
                if (loadedCount > 0) {
                    // 两张图片都加载完成，直接设置第一张，不触发动画
                    const layer1 = document.getElementById('wallpaper-layer-1');
                    const layer2 = document.getElementById('wallpaper-layer-2');
                    
                    if (!layer1 || !layer2) return;
                    
                    // 重置状态：两个图层都不透明，但只显示图层 1
                    layer1.style.transition = 'none'; // 禁用过渡动画
                    layer2.style.transition = 'none';
                    layer1.style.opacity = '1';
                    layer2.style.opacity = '0';
                    layer1.style.backgroundImage = `url(${images[0]})`;
                    layer2.style.backgroundImage = `url(${images[secondImageIndex]})`;
                    state.backgroundImage1 = images[0];
                    state.backgroundImage2 = images[secondImageIndex];
                    state.activeLayer = 1;
                    
                    // 恢复过渡动画
                    setTimeout(() => {
                        layer1.style.transition = 'opacity 1s ease-in-out';
                        layer2.style.transition = 'opacity 1s ease-in-out';
                    }, 50);
                    
                    // 设置当前索引为 secondImageIndex，这样下次就会切换到下一张
                    state.currentBackgroundIndex = secondImageIndex;
                    
                    // 启动轮播定时器
                    state.backgroundRotationTimer = setInterval(() => {
                        // 关键检查：如果歌曲已经切换，停止定时器
                        if (state.currentSongHash !== currentSongHashForRotation) {
                            console.log('[ArtistWallpaper] 歌曲已切换，停止旧轮播定时器');
                            clearRotationTimer();
                            return;
                        }
                        
                        // 如果正在切换中，跳过本次定时器触发
                        if (state.isTransitioning) {
                            return;
                        }
                        
                        state.currentBackgroundIndex = (state.currentBackgroundIndex + 1) % images.length;
                        const nextImage = images[state.currentBackgroundIndex];
                        
                        // 获取当前显示的图片
                        const currentImage = state.activeLayer === 1 ? state.backgroundImage2 : state.backgroundImage1;
                        
                        // 跳过与当前图片相同的图片
                        if (nextImage === currentImage) {
                            return; // 跳过相同的图片
                        }

                        // 标记开始切换
                        state.isTransitioning = true;

                        // 预加载下一张图片
                        const img = new Image();
                        img.src = nextImage;

                        img.onload = () => {
                            // 再次检查歌曲是否已切换
                            if (state.currentSongHash !== currentSongHashForRotation) {
                                console.log('[ArtistWallpaper] 图片加载中歌曲已切换，放弃');
                                state.isTransitioning = false;
                                return;
                            }
                            
                            // 确保图片完全解码后再切换
                            if ('decode' in img) {
                                img.decode().then(() => {
                                    updateBackgroundLayer(nextImage);
                                    state.isTransitioning = false; // 切换完成
                                }).catch(() => {
                                    updateBackgroundLayer(nextImage);
                                    state.isTransitioning = false;
                                });
                            } else {
                                updateBackgroundLayer(nextImage);
                                state.isTransitioning = false;
                            }
                        };

                        img.onerror = (error) => {
                            console.warn('[ArtistWallpaper] 背景图加载失败:', nextImage, error);
                            state.isTransitioning = false;
                        };
                    }, state.rotationInterval);
                }
            }
        };
        
        const onLoad = () => {
            loadedCount++;
            checkReady();
        };
        
        const onError = () => {
            errorCount++;
            checkReady();
        };
        
        img1.onload = onLoad;
        img2.onload = onLoad;
        img1.onerror = onError;
        img2.onerror = onError;
        
        // 如果图片已经在缓存中，手动触发 onload
        if (img1.complete) {
            if (img1.naturalWidth > 0) {
                onLoad();
            } else {
                onError();
            }
        }
        if (img2.complete) {
            if (img2.naturalWidth > 0) {
                onLoad();
            } else {
                onError();
            }
        }
    }

    /**
     * 多歌手写真交替播放策略
     * @param {string[][]} imagesByArtist - 每个歌手的写真数组 [歌手 1 的写真，歌手 2 的写真，...]
     */
    function startAlternatingRotation(imagesByArtist) {
        // 立即清除所有状态和定时器
        clearRotationTimer();
        state.isTransitioning = false;
            
        if (!imagesByArtist || imagesByArtist.length === 0) return;
            
        // 保存当前歌曲 hash 到闭包中，用于定时器验证
        const currentSongHashForAlternating = state.currentSongHash;
            
        // 重置所有状态，防止上一首歌的数据污染
        state.artistBackgroundImages = [];
        state.currentBackgroundIndex = 0;
        state.backgroundImage1 = null;
        state.backgroundImage2 = null;
        state.activeLayer = 1;
            
        // 记录每个歌手的当前索引（局部变量，不使用 state）
        const artistIndices = imagesByArtist.map(() => 0);
        let currentArtistIndex = 0;
            
        // 获取下一张图片（交替策略）
        const getNextImage = () => {
            // 遍历所有歌手，找到有写真的歌手
            for (let i = 0; i < imagesByArtist.length; i++) {
                // 计算当前要检查的歌手索引
                const checkIndex = (currentArtistIndex + i) % imagesByArtist.length;
                
                // 获取当前歌手的写真列表
                const currentArtistImages = imagesByArtist[checkIndex];
                    
                // 如果这个歌手有写真，返回一张图片
                if (currentArtistImages && currentArtistImages.length > 0) {
                    const imageIndex = artistIndices[checkIndex];
                    const image = currentArtistImages[imageIndex];
                        
                    // 更新这个歌手的索引（循环）
                    artistIndices[checkIndex] = (imageIndex + 1) % currentArtistImages.length;
                    
                    // 更新当前艺术家索引，下次从下一个开始
                    currentArtistIndex = (checkIndex + 1) % imagesByArtist.length;
                        
                    return image;
                }
            }
            
            // 所有歌手都没有写真
            return null;
        };
            
        // 获取前两张不同的图片
        const firstImage = getNextImage();
        let secondImage = getNextImage();
        let attemptCount = 0;
        const maxAttempts = 10; // 最多尝试 10 次
            
        // 确保第二张与第一张不同
        while (secondImage && secondImage === firstImage && attemptCount < maxAttempts) {
            secondImage = getNextImage();
            attemptCount++;
        }
            
        // 如果没有不同的第二张图片，不启动轮播
        if (!firstImage || !secondImage) {
            if (firstImage) {
                updateBackgroundLayer(firstImage);
            }
            return;
        }
            
        // 预加载前两张图片
        const img1 = new Image();
        img1.src = firstImage;
            
        const img2 = new Image();
        img2.src = secondImage;
            
        let loadedCount = 0;
        let errorCount = 0;
        const totalImages = 2;
        
        const checkReady = () => {
            // 检查是否所有图片都已处理（加载成功或失败）
            if (loadedCount + errorCount >= totalImages) {
                // 至少有一张图片加载成功才能启动轮播
                if (loadedCount > 0) {
                    // 两张图片都加载完成，直接设置第一张，不触发动画
                    const layer1 = document.getElementById('wallpaper-layer-1');
                    const layer2 = document.getElementById('wallpaper-layer-2');
                        
                    if (!layer1 || !layer2) return;
                        
                    // 重置状态：两个图层都不透明，但只显示图层 1
                    layer1.style.transition = 'none'; // 禁用过渡动画
                    layer2.style.transition = 'none';
                    layer1.style.opacity = '1';
                    layer2.style.opacity = '0';
                    layer1.style.backgroundImage = `url(${firstImage})`;
                    layer2.style.backgroundImage = `url(${secondImage})`;
                    state.backgroundImage1 = firstImage;
                    state.backgroundImage2 = secondImage;
                    state.activeLayer = 1;
                        
                    // 恢复过渡动画
                    setTimeout(() => {
                        layer1.style.transition = 'opacity 1s ease-in-out';
                        layer2.style.transition = 'opacity 1s ease-in-out';
                    }, 50);
                        
                    // 启动轮播定时器
                    state.backgroundRotationTimer = setInterval(() => {
                        // 关键检查：如果歌曲已经切换，停止定时器
                        if (state.currentSongHash !== currentSongHashForAlternating) {
                            console.log('[ArtistWallpaper] 歌曲已切换，停止旧轮播定时器');
                            clearRotationTimer();
                            return;
                        }
                        
                        // 如果正在切换中，跳过本次定时器触发
                        if (state.isTransitioning) {
                            return;
                        }
                            
                        const nextImage = getNextImage();
                            
                        if (!nextImage) return;
                            
                        // 跳过与当前图片相同的图片
                        const currentImage = state.activeLayer === 1 ? state.backgroundImage2 : state.backgroundImage1;
                        if (nextImage === currentImage) {
                            return; // 跳过相同的图片
                        }
                            
                        // 标记开始切换
                        state.isTransitioning = true;
                            
                        // 预加载下一张图片
                        const img = new Image();
                        img.src = nextImage;
                            
                        img.onload = () => {
                            // 再次检查歌曲是否已切换
                            if (state.currentSongHash !== currentSongHashForAlternating) {
                                console.log('[ArtistWallpaper] 图片加载中歌曲已切换，放弃');
                                state.isTransitioning = false;
                                return;
                            }
                            
                            // 确保图片完全解码后再切换
                            if ('decode' in img) {
                                img.decode().then(() => {
                                    updateBackgroundLayer(nextImage);
                                    state.isTransitioning = false; // 切换完成
                                }).catch(() => {
                                    updateBackgroundLayer(nextImage);
                                    state.isTransitioning = false;
                                });
                            } else {
                                updateBackgroundLayer(nextImage);
                                state.isTransitioning = false;
                            }
                        };
                            
                        img.onerror = (error) => {
                            console.warn('[ArtistWallpaper] 背景图加载失败:', nextImage, error);
                            state.isTransitioning = false;
                        };
                    }, state.rotationInterval);
                }
            }
        };
            
        const onLoad = () => {
            loadedCount++;
            checkReady();
        };
        
        const onError = () => {
            errorCount++;
            checkReady();
        };
            
        img1.onload = onLoad;
        img2.onload = onLoad;
        img1.onerror = onError;
        img2.onerror = onError;
            
        // 如果图片已经在缓存中，手动触发 onload
        if (img1.complete) {
            if (img1.naturalWidth > 0) {
                onLoad();
            } else {
                onError();
            }
        }
        if (img2.complete) {
            if (img2.naturalWidth > 0) {
                onLoad();
            } else {
                onError();
            }
        }
    }

    /**
     * 使用专辑封面作为背景
     */
    function useAlbumCoverAsBackground(albumCoverUrl) {
        // 清除之前的轮播状态
        clearRotationTimer();
        state.artistBackgroundImages = [];
        state.backgroundImage1 = null;
        state.backgroundImage2 = null;
        state.activeLayer = 1;
        state.isTransitioning = false;
        
        const defaultBg = albumCoverUrl || 'https://random.MoeJue.cn/randbg.php';
        updateBackgroundLayer(defaultBg);
    }

    /**
     * 获取多个歌手的写真并交替播放
     * @param {string[]} artistIds - 歌手 ID 数组
     * @param {string[]} artistNames - 歌手名称数组
     * @param {string} expectedSongHash - 期望的歌曲 hash（用于验证）
     */
    async function fetchMultipleArtistsBackground(artistIds, artistNames, expectedSongHash) {
        const allImagesByArtist = [];
        
        try {
            // 并发获取所有歌手的写真
            const promises = artistIds.map(async (id, index) => {
                const name = artistNames[index] || `歌手${index + 1}`;
                
                try {
                    const result = await chrome.runtime.sendMessage({
                        type: 'FETCH_ARTIST_WALLPAPER',
                        artistId: id,
                        artistName: name
                    });
                    
                    if (result.success && result.data && result.data.length > 0) {
                        return result.data;
                    } else {
                        return [];
                    }
                } catch (error) {
                    console.warn('[ArtistWallpaper] 获取歌手写真失败:', name, error);
                    return [];
                }
            });
            
            const results = await Promise.all(promises);
            
            // 检查歌曲是否已切换
            if (state.currentSongHash !== expectedSongHash) {
                console.log('[ArtistWallpaper] 歌曲已切换，放弃旧请求结果');
                return; // 歌曲已切换，放弃这次请求的结果
            }
            
            // 保存每个歌手的写真数组
            results.forEach(images => {
                if (images && images.length > 0) {
                    allImagesByArtist.push(images);
                }
            });
            
            const currentSong = getCurrentSong();
            if (allImagesByArtist.length > 0) {
                // 使用交替播放策略
                startAlternatingRotation(allImagesByArtist);
            } else {
                // 没有歌手写真，使用专辑封面
                useAlbumCoverAsBackground(currentSong?.img);
            }
        } catch (error) {
            console.error('[ArtistWallpaper] 获取多歌手写真失败:', error);
            const currentSong = getCurrentSong();
            useAlbumCoverAsBackground(currentSong?.img);
        }
    }

    /**
     * 获取当前播放歌曲信息
     * @returns {Object|null}
     */
    function getCurrentSong() {
        try {
            // 尝试从 localStorage 获取
            const currentSongStr = localStorage.getItem('current_song');
            if (currentSongStr) {
                return JSON.parse(currentSongStr);
            }
        } catch (error) {
            console.warn('[ArtistWallpaper] 获取当前歌曲失败:', error);
        }
        return null;
    }

    /**
     * 从搜索 API 获取歌手 ID
     * @param {string} artistName - 歌手名称
     * @returns {Promise<string|null>}
     */
    async function fetchArtistIdByName(artistName) {
        if (!artistName) return null;
        
        try {
            const result = await chrome.runtime.sendMessage({
                type: 'SEARCH_ARTIST_ID',
                artistName: artistName
            });
            
            if (result.success && result.data) {
                return result.data;
            }
        } catch (error) {
            console.warn('[ArtistWallpaper] 搜索歌手 ID 失败:', artistName, error);
        }
        return null;
    }

    /**
     * 获取歌手写真背景
     * @param {string} artistName - 歌手名称
     * @param {string} artistId - 歌手 ID
     * @param {string} expectedSongHash - 期望的歌曲 hash（用于验证）
     */
    async function fetchArtistBackground(artistName, artistId, expectedSongHash) {
        if (!artistId) {
            // 尝试通过搜索获取歌手 ID
            const searchedId = await fetchArtistIdByName(artistName);
            if (searchedId) {
                artistId = searchedId;
            } else {
                useAlbumCoverAsBackground(getCurrentSong()?.img);
                return;
            }
        }

        try {
            const result = await chrome.runtime.sendMessage({
                type: 'FETCH_ARTIST_WALLPAPER',
                artistId: artistId,
                artistName: artistName
            });
            
            // 检查歌曲是否已切换
            if (state.currentSongHash !== expectedSongHash) {
                console.log('[ArtistWallpaper] 歌曲已切换，放弃旧请求结果');
                return; // 歌曲已切换，放弃这次请求的结果
            }
            
            const currentSong = getCurrentSong();
            if (result.success && result.data && result.data.length > 0) {
                startRotation(result.data);
            } else {
                useAlbumCoverAsBackground(currentSong?.img);
            }
        } catch (error) {
            console.error('[ArtistWallpaper] 获取歌手写真失败:', error);
            useAlbumCoverAsBackground(getCurrentSong()?.img);
        }
    }

    /**
     * 处理歌曲切换
     */
    async function handleSongChange() {
        const currentSong = getCurrentSong();
        if (!currentSong) return;

        // 生成当前歌曲的唯一标识
        const songHash = `${currentSong.id || ''}_${currentSong.title || ''}_${currentSong.author || ''}`;
        
        console.log('[ArtistWallpaper] 歌曲切换:', songHash);
        
        // 立即标记当前歌曲 hash，防止并发请求污染
        state.currentSongHash = songHash;

        // 标记开始获取，阻止其他并发请求
        state.isFetchingWallpaper = true;

        // 立即清除所有状态和定时器，防止旧数据污染
        clearRotationTimer();
        state.artistBackgroundImages = [];
        state.backgroundImage1 = null;
        state.backgroundImage2 = null;
        state.activeLayer = 1;
        state.isTransitioning = false;
        state.currentBackgroundIndex = 0;
        
        // 立即清除 DOM 中的背景图层缓存，确保视觉上立刻清空
        clearBackgroundLayers();
        
        const artistId = currentSong.author_id || currentSong.singerid;
        const author = currentSong.author || '';

        try {
            if (artistId) {
                // 检查是否有多个歌手
                const artistIds = String(artistId).split('、').map(id => id.trim()).filter(id => id);
                const artistNames = author.split('、').map(name => name.trim()).filter(name => name);
                
                if (artistIds.length > 1) {
                    // 多歌手情况：获取所有歌手的写真
                    await fetchMultipleArtistsBackground(artistIds, artistNames, songHash);
                } else {
                    // 单歌手情况
                    await fetchArtistBackground(artistNames[0] || author, artistIds[0], songHash);
                }
            } else if (author) {
                // 歌曲数据中没有歌手 ID，尝试通过搜索获取
                const artistNames = author.split('、').map(name => name.trim()).filter(name => name);
                
                if (artistNames.length > 1) {
                    // 多歌手情况：分别搜索每个歌手
                    const searchPromises = artistNames.map(name => fetchArtistIdByName(name));
                    
                    const results = await Promise.all(searchPromises);
                    const ids = results.filter(id => id !== null);
                    if (ids.length > 0) {
                        await fetchMultipleArtistsBackground(ids, artistNames, songHash);
                    } else {
                        useAlbumCoverAsBackground(currentSong.img);
                    }
                } else {
                    // 单歌手情况
                    const id = await fetchArtistIdByName(artistNames[0] || author);
                    if (id) {
                        await fetchArtistBackground(artistNames[0] || author, id, songHash);
                    } else {
                        useAlbumCoverAsBackground(currentSong.img);
                    }
                }
            } else {
                useAlbumCoverAsBackground(currentSong.img);
            }
        } catch (error) {
            console.error('[ArtistWallpaper] 处理歌曲切换失败:', error);
            useAlbumCoverAsBackground(currentSong.img);
        } finally {
            // 无论成功或失败，都标记获取完成
            state.isFetchingWallpaper = false;
        }
    }

    /**
     * 监听歌词界面显示和歌曲切换
     */
    function setupLyricsObserver() {
        let lastSongHash = null;
        let checkInterval = null;
        
        // 定时检查歌曲变化
        const startSongCheckInterval = () => {
            if (checkInterval) clearInterval(checkInterval);
            checkInterval = setInterval(() => {
                const currentSong = getCurrentSong();
                const currentHash = currentSong?.hash;
                
                // 如果歌曲变化了，更新写真
                if (currentHash && currentHash !== lastSongHash) {
                    lastSongHash = currentHash;
                    handleSongChange();
                }
            }, 1000); // 每秒检查一次
        };
        
        // 使用 MutationObserver 监听 DOM 变化
        state.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    const lyricsScreen = document.querySelector('.lyrics-screen');
                    if (lyricsScreen) {
                        // 歌词界面显示时初始化背景图层
                        if (!state.isInitialized) {
                            state.isInitialized = true;
                            initBackgroundLayers();
                            // 延迟处理歌曲以等待数据加载
                            setTimeout(handleSongChange, 500);
                            // 启动定时检查
                            startSongCheckInterval();
                        }
                        
                        // 注意：不再在这里检查歌曲变化，避免使用缓存的旧歌曲数据
                        // 只通过定时器检查歌曲变化
                    } else {
                        // 歌词界面隐藏时
                        state.isInitialized = false;
                        if (checkInterval) {
                            clearInterval(checkInterval);
                            checkInterval = null;
                        }
                    }
                }
            }
        });

        state.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * 监听 localStorage 变化
     */
    function setupStorageListener() {
        window.addEventListener('storage', (event) => {
            if (event.key === 'current_song') {
                handleSongChange();
            }
        });
    }

    /**
     * 清理资源
     */
    function cleanup() {
        clearRotationTimer();
        
        // 清除歌曲检查定时器
        if (state.checkInterval) {
            clearInterval(state.checkInterval);
            state.checkInterval = null;
        }
        
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }

        // 移除背景容器
        const bgContainer = document.getElementById('wallpaper-container');
        if (bgContainer) bgContainer.remove();

        state.isInitialized = false;
    }

    /**
     * 初始化插件
     */
    function init() {
        // 等待 DOM 加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setupLyricsObserver();
                setupStorageListener();
            });
        } else {
            setupLyricsObserver();
            setupStorageListener();
        }

        // 监听页面卸载
        window.addEventListener('beforeunload', cleanup);
    }

    // 启动插件
    init();
})();
