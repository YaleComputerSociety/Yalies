"use client";

import { useState, useCallback, useRef } from "react";
import type { ProgressEvent } from "@/lib/types";

export default function useSSE(url: string, body: Record<string, unknown>) {
	const [events, setEvents] = useState<ProgressEvent[]>([]);
	const [latestEvent, setLatestEvent] = useState<ProgressEvent | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const start = useCallback(async () => {
		setEvents([]);
		setLatestEvent(null);
		setError(null);
		setIsRunning(true);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const response = await fetch(url, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`HTTP ${response.status}: ${text}`);
			}

			if (!response.body) {
				throw new Error("Response body is null");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n\n");
				buffer = lines.pop() ?? "";

				for (const chunk of lines) {
					const trimmed = chunk.trim();
					if (!trimmed.startsWith("data: ")) continue;

					const jsonStr = trimmed.slice(6);
					try {
						const event: ProgressEvent = JSON.parse(jsonStr);
						setEvents((prev) => [...prev, event]);
						setLatestEvent(event);
					} catch {
						// Skip malformed JSON
					}
				}
			}

			// Process remaining buffer
			if (buffer.trim().startsWith("data: ")) {
				const jsonStr = buffer.trim().slice(6);
				try {
					const event: ProgressEvent = JSON.parse(jsonStr);
					setEvents((prev) => [...prev, event]);
					setLatestEvent(event);
				} catch {
					// Skip malformed JSON
				}
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				// User cancelled
			} else {
				const message = err instanceof Error ? err.message : "Unknown error";
				setError(message);
			}
		} finally {
			setIsRunning(false);
			abortRef.current = null;
		}
	}, [url, body]);

	const stop = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	return { start, stop, events, latestEvent, isRunning, error };
}
