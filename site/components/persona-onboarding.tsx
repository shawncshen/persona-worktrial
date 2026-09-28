"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Mic, MicOff, Phone, PhoneOff, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { isOnboardingReady, mergeAgentTurn, ONBOARDING_STORAGE_KEY, type AgentTurn, type Attachment, type Message, type OnboardingState } from "@/lib/onboarding";
import { parseRealtimeVoiceEvent } from "@/lib/voice";

type ModelContext = {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: object;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => unknown;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

type SpeechRecognitionResultEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionErrorEventLike = Event & { error: string };

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function stripAttachmentPreview(attachment: Attachment) {
  const { id, name, type, size } = attachment;
  return { id, name, type, size };
}

const initialMessages: Message[] = [{
  id: "welcome",
  role: "agent",
  text: "welcome to persona :)\n\nI'm your personal agent, what do you want to name me?",
}];
const COMPLETION_MESSAGE = "You're done with onboarding. Let me know if you need anything from me!";
const initialState: OnboardingState = {
  agentName: "", userName: "", userEmail: "", primaryNeed: "", callStatus: "not_offered", onboardingComplete: false,
  currentGoal: "", nextStep: "", pendingCommitment: "", awaitingUserInput: "",
};
const DEVICE_STORAGE_KEY = "persona-device-id";

function nextOnboardingQuestion(profile: OnboardingState) {
  if (!profile.agentName) return "What do you want to name me?";
  if (!profile.userName) return "What should I call you?";
  if (!profile.userEmail) return "What’s the best email address for you?";
  return "";
}

function MessageText({ text }: { text: string }) {
  const lines = text.replace(/\s+•\s*/g, "\n• ").split("\n");
  const blocks: Array<{ type: "paragraph" | "list"; content: string[] }> = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (/^[•*-]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[•*-]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[•*-]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", content: items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^[•*-]\s+/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", content: [paragraph.join(" ")] });
  }

  return <>{blocks.map((block, index) => block.type === "list"
    ? <ul key={`list-${index}`}>{block.content.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
    : <p key={`paragraph-${index}`}>{block.content[0]}</p>)}</>;
}

export function PersonaOnboarding() {
  const router = useRouter();
  const [profile, setProfile] = useState<OnboardingState>(initialState);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [dictationStatus, setDictationStatus] = useState<"idle" | "listening" | "error">("idle");
  const [dictationMessage, setDictationMessage] = useState("");
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callMuted, setCallMuted] = useState(false);
  const [callPhase, setCallPhase] = useState<"requesting_permission" | "connecting" | "active" | "error">("requesting_permission");
  const [, setCallListening] = useState(false);
  const [callError, setCallError] = useState("");
  const [callSeconds, setCallSeconds] = useState(0);
  const [, setCallCaption] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentUrlsRef = useRef<string[]>([]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesRef = useRef<Message[]>(initialMessages);
  const profileRef = useRef<OnboardingState>(initialState);
  const voiceMessagesRef = useRef<Message[]>([]);
  const voiceIdentityRef = useRef({ deviceId: "", sessionId: "" });
  const liveTranscriptRef = useRef("");
  const callAttemptRef = useRef(0);
  const callRequestRef = useRef<AbortController | null>(null);
  const completionQueuedRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationBaseRef = useRef("");

  useEffect(() => {
    let deviceId = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
    voiceIdentityRef.current.deviceId = deviceId;
    const saved = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { profile: OnboardingState; messages: Message[] };
        // Hydrate the durable demo state after the client mounts.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setProfile({
          ...initialState,
          ...parsed.profile,
          userEmail: parsed.profile.userEmail || "",
          onboardingComplete: Boolean(parsed.profile.onboardingComplete),
        });
        setMessages(parsed.messages);
      } catch { window.localStorage.removeItem(ONBOARDING_STORAGE_KEY); }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      const persistedMessages = messages.map((message) => ({
        ...message,
        attachments: message.attachments?.map(stripAttachmentPreview),
      }));
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ profile, messages: persistedMessages }));
    }
  }, [messages, profile, ready]);

  useEffect(() => () => attachmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let animationFrame = 0;
    const settleTimers: number[] = [];
    const updateViewport = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--visual-viewport-height", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
        document.documentElement.style.setProperty("--visual-viewport-top", `${Math.round(viewport?.offsetTop ?? 0)}px`);
        if (window.matchMedia("(max-width: 640px)").matches && document.activeElement?.matches(".message-input-wrap input")) {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        }
      });
    };
    const settleViewport = () => {
      updateViewport();
      settleTimers.splice(0).forEach((timer) => window.clearTimeout(timer));
      [80, 220, 420].forEach((delay) => settleTimers.push(window.setTimeout(updateViewport, delay)));
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("orientationchange", settleViewport);
    document.addEventListener("focusin", settleViewport);
    document.addEventListener("focusout", settleViewport);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("orientationchange", settleViewport);
      document.removeEventListener("focusin", settleViewport);
      document.removeEventListener("focusout", settleViewport);
      document.documentElement.style.removeProperty("--visual-viewport-height");
      document.documentElement.style.removeProperty("--visual-viewport-top");
    };
  }, []);

  useEffect(() => {
    if (!callActive) return;
    const timer = window.setInterval(() => setCallSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callActive]);

  const addAgentMessage = (text: string, delay = 620) => {
    setTyping(true);
    window.setTimeout(() => {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "agent", text }]);
      setTyping(false);
    }, delay);
  };

  useEffect(() => {
    if (!ready || typing || profile.onboardingComplete || completionQueuedRef.current || !isOnboardingReady(profile)) return;
    completionQueuedRef.current = true;
    const timer = window.setTimeout(() => {
      setProfile((current) => current.onboardingComplete ? current : { ...current, onboardingComplete: true });
      setMessages((items) => items.some((message) => message.text === COMPLETION_MESSAGE)
        ? items
        : [...items, { id: crypto.randomUUID(), role: "agent", text: COMPLETION_MESSAGE }]);
    }, 0);
    return () => window.clearTimeout(timer);
  // Completion is derived from the persisted onboarding fields and must fire only once.
  }, [profile, ready, typing]);

  const requestAgentTurn = async (nextMessages: Message[], currentProfile: OnboardingState, channel: "text" | "voice") => {
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: nextMessages.map((message) => ({
          ...message,
          attachments: message.attachments?.map(stripAttachmentPreview),
        })),
        profile: currentProfile,
        channel,
      }),
    });
    if (!response.ok) throw new Error("Agent response failed");
    return await response.json() as AgentTurn;
  };

  const sendText = async (rawText: string) => {
    const text = rawText.trim();
    if ((!text && pendingAttachments.length === 0) || typing) return;
    if (dictationStatus === "listening") recognitionRef.current?.stop();
    setDictationMessage("");
    setDictationStatus("idle");
    const attachments = pendingAttachments;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text, attachments };
    const nextMessages = [...messages, userMessage];
    setInput("");
    setPendingAttachments([]);
    setAttachmentError("");
    setMessages(nextMessages);
    setTyping(true);
    window.requestAnimationFrame(() => {
      if (!window.matchMedia("(max-width: 640px)").matches) {
        shellRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    try {
      const turn = await requestAgentTurn(nextMessages, profile, "text");
      const updatedProfile = mergeAgentTurn(profile, turn);
      const completesNow = !profile.onboardingComplete && isOnboardingReady(updatedProfile);
      const completedProfile = completesNow ? { ...updatedProfile, onboardingComplete: true } : updatedProfile;
      if (completesNow) completionQueuedRef.current = true;
      setProfile(completedProfile);
      setMessages((items) => {
        const reactedItems = items.map((message) => turn.acknowledgedTask && message.id === userMessage.id
          ? { ...message, reaction: turn.reaction || "👍" }
          : message);
        if (completesNow) {
          const shouldContinueTask = turn.acknowledgedTask || Boolean(completedProfile.pendingCommitment);
          return [
            ...reactedItems,
            { id: crypto.randomUUID(), role: "agent", text: COMPLETION_MESSAGE },
            ...(shouldContinueTask && turn.reply.trim()
              ? [{ id: crypto.randomUUID(), role: "agent" as const, text: turn.reply.trim() }]
              : []),
          ];
        }
        return [
          ...reactedItems,
          { id: crypto.randomUUID(), role: "agent", text: turn.reply },
          ...(turn.onboardingFollowUp?.trim()
            ? [{ id: crypto.randomUUID(), role: "agent" as const, text: turn.onboardingFollowUp.trim() }]
            : []),
        ];
      });
    } catch {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "agent", text: "I lost my train of thought for a second. Try sending that again?" }]);
    } finally {
      setTyping(false);
    }
  };

  const chooseAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    const availableSlots = Math.max(0, 5 - pendingAttachments.length);
    const selected = Array.from(files).slice(0, availableSlots);
    const tooLarge = selected.some((file) => file.size > 15 * 1024 * 1024);
    const accepted = selected.filter((file) => file.size <= 15 * 1024 * 1024).map((file) => {
      const previewUrl = URL.createObjectURL(file);
      attachmentUrlsRef.current.push(previewUrl);
      return { id: crypto.randomUUID(), name: file.name, type: file.type || "application/octet-stream", size: file.size, previewUrl };
    });
    setPendingAttachments((current) => [...current, ...accepted]);
    setAttachmentError(tooLarge ? "Each attachment must be 15 MB or smaller." : files.length > availableSlots ? "You can attach up to five files at once." : "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    void sendText(input);
  };

  const stopDictation = () => {
    recognitionRef.current?.stop();
  };

  const toggleDictation = () => {
    if (dictationStatus === "listening") {
      stopDictation();
      return;
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setDictationStatus("error");
      setDictationMessage("Dictation isn’t supported in this browser. You can keep typing here.");
      return;
    }

    const recognition = new Recognition();
    let dictationFailed = false;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    dictationBaseRef.current = input.trim();
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
      const separator = dictationBaseRef.current && transcript.trim() ? " " : "";
      setInput(`${dictationBaseRef.current}${separator}${transcript.trimStart()}`);
    };
    recognition.onerror = (event) => {
      dictationFailed = true;
      setDictationStatus("error");
      setDictationMessage(event.error === "not-allowed"
        ? "Microphone access was blocked. Allow it in your browser, or keep typing."
        : "Dictation stopped unexpectedly. Your draft is still here.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (!dictationFailed) {
        setDictationStatus("idle");
        setDictationMessage("Dictation added to your draft.");
      }
    };
    recognitionRef.current = recognition;
    setDictationMessage("Listening… tap the microphone when you’re done.");
    setDictationStatus("listening");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setDictationStatus("error");
      setDictationMessage("Dictation couldn’t start. Your draft is still here.");
    }
  };

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && event.metaKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const startCall = () => {
    callAttemptRef.current += 1;
    voiceMessagesRef.current = [];
    voiceIdentityRef.current.sessionId = crypto.randomUUID();
    setCallOpen(true);
    setCallActive(false);
    setCallMuted(false);
    setCallPhase("requesting_permission");
    setCallSeconds(0);
    setCallError("");
    setCallCaption("");
  };

  const persistVoiceMessage = async (message: Message) => {
    const response = await fetch("/api/onboarding/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...voiceIdentityRef.current, message }),
    });
    if (!response.ok) throw new Error("Voice message persistence failed");
  };

  const saveVoiceMemory = async (voiceMessages: Message[]) => {
    try {
      const response = await fetch("/api/onboarding/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: voiceMessages, profile: profileRef.current, ...voiceIdentityRef.current }),
      });
      if (!response.ok) throw new Error("Voice memory persistence failed");
      const turn = await response.json() as Omit<AgentTurn, "reply">;
      const updatedProfile = mergeAgentTurn(profileRef.current, { ...turn, reply: "" });
      profileRef.current = updatedProfile;
      setProfile(updatedProfile);
      return updatedProfile;
    } catch {
      setCallError("The call is still active, but I couldn’t save this turn yet.");
      return profileRef.current;
    }
  };

  const answerCall = async (attempt: number) => {
    setCallError("");
    setCallPhase("requesting_permission");
    setCallCaption("Allow microphone access to start the call.");
    let pendingStream: MediaStream | null = null;
    try {
      const microphoneRequest = navigator.mediaDevices.getUserMedia({ audio: true });
      void microphoneRequest.then((lateStream) => {
        if (attempt !== callAttemptRef.current) lateStream.getTracks().forEach((track) => track.stop());
      }).catch(() => undefined);
      const permissionTimeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("microphone-timeout")), 12000));
      const stream = await Promise.race([
        microphoneRequest,
        permissionTimeout,
      ]);
      pendingStream = stream;
      if (attempt !== callAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setCallPhase("connecting");
      setCallCaption("Connecting securely…");
      const peer = new RTCPeerConnection();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      peer.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const channel = peer.createDataChannel("oai-events");

      peerRef.current = peer;
      dataChannelRef.current = channel;
      microphoneRef.current = stream;
      remoteAudioRef.current = audio;

      channel.addEventListener("message", (event) => {
        const parsed = parseRealtimeVoiceEvent(event.data);
        if (parsed.kind === "user_transcript") {
          const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: parsed.text };
          voiceMessagesRef.current = [...voiceMessagesRef.current, userMessage];
          void persistVoiceMessage(userMessage).catch(() => setCallError("The call is still active, but I couldn’t save this turn yet."));
        }
        if (parsed.kind === "agent_delta") {
          liveTranscriptRef.current += parsed.text;
          setCallCaption(liveTranscriptRef.current);
        }
        if (parsed.kind === "agent_transcript") {
          const transcript = (parsed.text || liveTranscriptRef.current).trim();
          liveTranscriptRef.current = "";
          if (!transcript) return;
          setCallCaption(transcript);
          const agentMessage: Message = { id: crypto.randomUUID(), role: "agent", text: transcript };
          voiceMessagesRef.current = [...voiceMessagesRef.current, agentMessage];
          void persistVoiceMessage(agentMessage).catch(() => setCallError("The call is still active, but I couldn’t save this turn yet."));
          void saveVoiceMemory(voiceMessagesRef.current);
        }
        if (parsed.kind === "error") setCallError(`${parsed.text} You can continue by text.`);
      });

      channel.addEventListener("open", () => {
        if (attempt !== callAttemptRef.current) return;
        setCallActive(true);
        setCallPhase("active");
        setCallListening(true);
        setCallCaption("Listening…");
        messagesRef.current.slice(-24).forEach((message) => channel.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: message.role === "agent" ? "assistant" : "user",
            content: [{ type: message.role === "agent" ? "output_text" : "input_text", text: message.text }],
          },
        })));
        const greeting = profileRef.current.agentName
          ? profileRef.current.userName
            ? `Say exactly: "Hey ${profileRef.current.userName}, it’s ${profileRef.current.agentName}. Let’s continue where we left off."`
            : `Say exactly: "Hey, it’s ${profileRef.current.agentName}. What should I call you?"`
          : `Say exactly: "Hey! Before we get started, what do you want to name me?"`;
        channel.send(JSON.stringify({ type: "response.create", response: { instructions: greeting } }));
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const requestController = new AbortController();
      callRequestRef.current = requestController;
      const connectionTimeout = window.setTimeout(() => requestController.abort(), 15000);
      const response = await fetch("/api/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, profile: profileRef.current }),
        signal: requestController.signal,
      });
      window.clearTimeout(connectionTimeout);
      if (!response.ok) throw new Error(await response.text());
      if (attempt !== callAttemptRef.current) return;
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (error) {
      if (attempt !== callAttemptRef.current) {
        pendingStream?.getTracks().forEach((track) => track.stop());
        return;
      }
      microphoneRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
      peerRef.current = null;
      microphoneRef.current = null;
      setCallActive(false);
      setCallPhase("error");
      const errorName = error instanceof DOMException ? error.name : "";
      const errorMessage = error instanceof Error ? error.message : "";
      setCallError(errorName === "NotAllowedError"
        ? "Microphone access was blocked. Allow it in your browser, or keep texting."
        : errorName === "NotFoundError"
          ? "I couldn’t find a microphone. Connect one, or keep texting."
          : errorMessage === "microphone-timeout"
            ? "Microphone permission is taking too long. You can hang up and try again."
            : "I couldn’t start the live call. Check microphone access, or keep going by text.");
      if (errorMessage === "microphone-timeout") callAttemptRef.current += 1;
      setCallCaption("");
    }
  };

  useEffect(() => {
    if (!callOpen || callActive || peerRef.current) return;
    void answerCall(callAttemptRef.current);
  // answerCall intentionally snapshots refs for one call attempt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callActive, callOpen]);

  const endCall = () => {
    callAttemptRef.current += 1;
    callRequestRef.current?.abort();
    callRequestRef.current = null;
    dataChannelRef.current?.close();
    peerRef.current?.close();
    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    dataChannelRef.current = null;
    peerRef.current = null;
    microphoneRef.current = null;
    remoteAudioRef.current = null;
    setCallOpen(false);
    setCallActive(false);
    setCallMuted(false);
    setCallListening(false);
    const finishCall = async () => {
      const savedProfile = voiceMessagesRef.current.length
        ? await saveVoiceMemory(voiceMessagesRef.current)
        : profileRef.current;
      const endedProfile = { ...savedProfile, callStatus: "ended" as const };
      profileRef.current = endedProfile;
      setProfile(endedProfile);
      const nextQuestion = nextOnboardingQuestion(endedProfile);
      if (nextQuestion) addAgentMessage(nextQuestion, 300);
    };
    void finishCall();
  };

  const toggleCallMute = () => {
    const nextMuted = !callMuted;
    microphoneRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setCallMuted(nextMuted);
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = context.registerTool({
      name: "send_onboarding_message",
      title: "Message Persona",
      description: "Send a message through the visible Persona onboarding conversation.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string", minLength: 1, maxLength: 500 } },
        required: ["message"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(value) {
        const message = typeof value === "object" && value !== null && "message" in value ? String((value as { message: unknown }).message).trim() : "";
        if (!message || message.length > 500) throw new Error("Message must contain 1 to 500 characters.");
        void sendText(message);
        return { accepted: true, agentName: profile.agentName || null };
      },
    }, { signal: lifecycle.signal });
    void Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
  // The tool is intentionally re-registered whenever its state snapshot changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, typing]);

  const resetDemo = () => {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    setProfile(initialState);
    setMessages(initialMessages);
    setInput("");
    pendingAttachments.forEach((attachment) => attachment.previewUrl && URL.revokeObjectURL(attachment.previewUrl));
    setPendingAttachments([]);
    setAttachmentError("");
    completionQueuedRef.current = false;
  };

  const agentLabel = profile.agentName || "Your Persona";

  return (
    <main className="persona-page">
      <header className="site-header">
        <button type="button" className="wordmark" onClick={resetDemo} aria-label="Restart Persona onboarding">
          <span className="wordmark-base">persona</span>
          <span className="wordmark-sheen" aria-hidden="true">persona</span>
        </button>
        <div className="header-actions">
          <button type="button" className="memory-link" onClick={() => router.push("/memory")}>What I know</button>
        </div>
      </header>

      <section className="intro-copy" aria-labelledby="page-title">
        <h1 id="page-title">
          <span>First AI assistant you can wear.</span>
          <span>Made to get sh*t done.</span>
        </h1>
        <p>Your Persona remembers what matters and does<br className="desktop-break" /> what you need before you know you need it.</p>
      </section>

      <section id="conversation" className="message-shell" aria-label="Persona onboarding conversation" ref={shellRef}>
        <header className="message-header">
          <button type="button" className="chat-reset-button" onClick={resetDemo}>Restart session</button>
          <div className="contact-identity">
            <div className="contact-avatar" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/agent-avatar-v2.png" alt="" />
            </div>
            <strong>{agentLabel}</strong>
          </div>
          <button type="button" className="icon-button" aria-label={`Call ${agentLabel}`} onClick={startCall}><Phone size={19} strokeWidth={1.9} /></button>
        </header>

        <div className="message-body" role="log" aria-live="polite" ref={scrollRef}>
          <p className="time-label">Today 9:41 AM</p>
          {messages.map((message) => (
            <div key={message.id} className={`bubble-row ${message.role === "user" ? "outgoing" : "incoming"}`}>
              <div className="message-bubble-wrap">
                <div className="message-bubble">
                  {message.attachments?.length ? <div className="message-attachments">
                    {message.attachments.map((attachment) => attachment.type.startsWith("image/") && attachment.previewUrl
                      // Blob URLs are device-local previews and cannot use the framework image optimizer.
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img key={attachment.id} src={attachment.previewUrl} alt={attachment.name} />
                      : <div className="file-attachment" key={attachment.id}><FileText size={18} /><span>{attachment.name}</span></div>)}
                  </div> : null}
                  {message.text && <MessageText text={message.text} />}
                </div>
                {message.reaction && <span className="message-reaction" aria-label={`Agent reacted with ${message.reaction === "thumbs_up" ? "thumbs up" : message.reaction}`}>{message.reaction === "thumbs_up" ? "👍" : message.reaction}</span>}
              </div>
            </div>
          ))}
          {typing && <div className="bubble-row incoming" aria-label={`${agentLabel} is typing`}><div className="typing-bubble"><span /><span /><span /></div></div>}
        </div>

        <form className="composer" onSubmit={submitText}>
          {pendingAttachments.length > 0 && <div className="attachment-tray" aria-label="Selected attachments">
            {pendingAttachments.map((attachment) => <div className="pending-attachment" key={attachment.id}>
              {attachment.type.startsWith("image/") && attachment.previewUrl
                // Blob URLs are device-local previews and cannot use the framework image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={attachment.previewUrl} alt="" />
                : <FileText size={19} />}
              <span>{attachment.name}</span>
              <button type="button" onClick={() => removePendingAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}><X size={14} /></button>
            </div>)}
          </div>}
          {attachmentError && <p className="attachment-error" role="alert">{attachmentError}</p>}
          {dictationMessage && <p className={`dictation-status ${dictationStatus === "error" ? "error" : ""}`} role="status">{dictationMessage}</p>}
          <input ref={fileInputRef} className="attachment-input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.rtf,.csv,.xls,.xlsx" onChange={(event) => chooseAttachments(event.target.files)} />
          <button type="button" className="composer-icon" aria-label="Attach photos or files" onClick={() => fileInputRef.current?.click()}><Plus size={21} strokeWidth={1.9} /></button>
          <label className="message-input-wrap">
            <span className="sr-only">Message {agentLabel}</span>
            <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleComposerKeyDown} type="text" inputMode="text" enterKeyHint="send" autoCapitalize="sentences" spellCheck placeholder="Message" aria-label={`Message ${agentLabel}`} autoComplete="off" />
            {dictationStatus === "listening"
              ? <button type="button" className="mic-button listening" aria-label="Stop dictation" aria-pressed="true" onClick={toggleDictation}><MicOff size={19} strokeWidth={1.9} /></button>
              : input.trim() || pendingAttachments.length
                ? <button type="submit" className="send-button" aria-label="Send message"><ArrowUp size={18} strokeWidth={2.4} /></button>
                : <button type="button" className="mic-button" aria-label="Dictate a message" aria-pressed="false" onClick={toggleDictation}><Mic size={19} strokeWidth={1.9} /></button>}
          </label>
        </form>
      </section>

      {callOpen && (
        <div className="call-backdrop" role="dialog" aria-modal="true" aria-label={`Voice call with ${agentLabel}`}>
          <div className="call-panel">
            <div className="call-aura" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/agent-avatar-v2.png" alt="" />
            </div>
            <h2>{agentLabel}</h2>
            <p className="call-status">{callActive
              ? `${String(Math.floor(callSeconds / 60)).padStart(2, "0")}:${String(callSeconds % 60).padStart(2, "0")}`
              : callPhase === "requesting_permission" ? "waiting for microphone…" : callPhase === "connecting" ? "connecting…" : "call didn’t connect"}</p>
            {callError && <p className="call-error" role="alert">{callError}</p>}
            <div className="active-call-actions">
              <button type="button" className={`mute-control${callMuted ? " muted" : ""}`} aria-label={callMuted ? "Unmute microphone" : "Mute microphone"} aria-pressed={callMuted} onClick={toggleCallMute}>
                {callMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <button type="button" className="hangup-control" aria-label="Hang up" onClick={endCall}><PhoneOff size={25} /></button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
