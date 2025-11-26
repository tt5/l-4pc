import { createSignal } from 'solid-js';
import { fetchBasePoints as fetchBasePointsUtil } from '../utils/boardUtils';
import type { User } from '../types/user';
import type { Point, BasePoint } from '../types/board';

type UseFetchBasePointsProps = {
  user: () => User | null;
  currentPosition: () => Point;
};

export function useFetchBasePoints({ user, currentPosition }: UseFetchBasePointsProps) {
  const [basePoints, setBasePoints] = createSignal<BasePoint[]>([]);
  const [isFetching, setIsFetching] = createSignal(false);
  const [lastFetchTime, setLastFetchTime] = createSignal(0);
  const [error, setError] = createSignal<Error | null>(null);

  const fetchBasePoints = async () => {
    await fetchBasePointsUtil({
      user,
      currentPosition,
      lastFetchTime,
      isFetching,
      setBasePoints,
      setLastFetchTime,
      setIsFetching,
    }).catch((err) => {
      setError(err instanceof Error ? err : new Error('Failed to fetch base points'));
    });
  };

  return {
    basePoints,
    isFetching,
    error,
    fetchBasePoints,
    lastFetchTime,
  };
}
