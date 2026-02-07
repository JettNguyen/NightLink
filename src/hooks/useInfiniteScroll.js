import { useState, useEffect, useRef, useCallback } from 'react';

const useInfiniteScroll = (options = {}) => {
  const {
    onLoadMore = () => {},
    hasMore = true,
    threshold = 0.5,
    isLoading = false
  } = options;

  const containerRef = useRef(null);
  const observerRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!hasMore || isLoading || !containerRef.current) return;

    const observerOptions = {
      root: containerRef.current,
      rootMargin: '200px',
      threshold
    };

    const callback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      });
    };

    observerRef.current = new IntersectionObserver(callback, observerOptions);

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoading, onLoadMore, threshold]);

  return {
    containerRef,
    sentinelRef
  };
};

export default useInfiniteScroll;
