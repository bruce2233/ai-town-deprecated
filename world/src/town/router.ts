
import { Subject, filter, Observable } from 'rxjs';

export interface TownEvent {
    type: string; // 'message' | 'system'
    topic: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any;
    sender?: string;
    timestamp?: number;
}

export class TownRouter {
    private bus$ = new Subject<TownEvent>();

    publish(event: TownEvent) {
        // Enforce timestamp
        const finalEvent = {
            ...event,
            timestamp: event.timestamp || Date.now()
        };
        this.bus$.next(finalEvent);
    }

    subscribe(topic: string): Observable<TownEvent> {
        return this.bus$.asObservable().pipe(
            filter(e => e.topic === topic || e.topic === '*')
        );
    }

    asObservable(): Observable<TownEvent> {
        return this.bus$.asObservable();
    }
}

// Singleton instance for the process
export const globalRouter = new TownRouter();
