import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ArrowUpRight,
  RotateCcw,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { useVoiceCall } from './use-voice-call.js';
import { formatDuration } from './format.js';

export type VoiceCall = ReturnType<typeof useVoiceCall>;
export const VoicePanel = ({ call }: { call: VoiceCall }) => {
  const [consent, setConsent] = useState(false);
  const busy = ['permission', 'connecting', 'connected'].includes(call.phase);
  const connected = call.phase === 'connected';
  const labels = {
    idle: 'How can we help you?',
    permission: 'Allow your microphone.',
    connecting: 'Connecting your call…',
    connected: call.muted ? 'Your microphone is muted.' : 'You’re connected.',
    ended: 'Thanks for the conversation.',
    failed: 'Let’s try that again.',
  };
  return (
    <section
      className={`voice-panel voice-panel--${call.phase}`}
      id="conversation"
      aria-labelledby="voice-heading"
      tabIndex={-1}
    >
      <div className="voice-panel-top">
        <span>
          <span className="signal-dot" /> YOUR AI CONSULTATION
        </span>
        <span className="voice-language">EN / हिंदी</span>
      </div>
      <div
        className="voice-symbol"
        style={{ '--voice-level': call.level } as CSSProperties}
        aria-hidden="true"
      >
        <span className="voice-ring voice-ring--outer" />
        <span className="voice-ring" />
        <div className="voice-core">
          {call.muted ? (
            <MicOff size={29} strokeWidth={1.5} />
          ) : (
            <Mic size={29} strokeWidth={1.5} />
          )}
        </div>
        {connected && (
          <div className="voice-meter">
            {[0.35, 0.7, 1, 0.6, 0.9, 0.5, 0.3].map((factor, i) => (
              <i key={i} style={{ height: `${4 + call.level * 38 * factor}px` }} />
            ))}
          </div>
        )}
      </div>
      <div className="voice-copy">
        <p className="voice-eyebrow">
          {connected
            ? `${formatDuration(call.elapsed)} · ${call.level > 0.035 ? 'AI audio detected' : call.muted ? 'Microphone off' : 'Microphone on'}`
            : busy
              ? 'ONE MOMENT'
              : 'ASK A QUESTION OR TELL US WHAT YOU NEED'}
        </p>
        <h2 id="voice-heading" aria-live="polite">
          {labels[call.phase]}
        </h2>
        <p>
          {call.phase === 'idle'
            ? 'Ask about our services, describe a project you want to build, or get help with an existing product.'
            : call.phase === 'permission'
              ? 'Your browser will ask to use your microphone. Choose Allow to continue.'
              : call.phase === 'connecting'
                ? 'Preparing your browser call. This can take a few moments.'
                : connected
                  ? 'Speak naturally. You’re talking with our AI representative. You can pause or end the call at any time.'
                  : call.phase === 'ended'
                    ? `${call.elapsed ? `${formatDuration(call.elapsed)} on the call. ` : ''}Your call has ended. If a request was saved, our team can review it in the dashboard.`
                    : 'Check the message below, then try again when you are ready.'}
        </p>
      </div>
      {call.error && (
        <p role="alert" className="voice-error">
          {call.error}
        </p>
      )}
      {!busy && (
        <label className="voice-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree to microphone use and conversation processing.</span>
        </label>
      )}
      <div className="voice-actions">
        {connected ? (
          <>
            <button
              type="button"
              className="voice-mute"
              onClick={call.toggleMute}
              aria-pressed={call.muted}
            >
              {call.muted ? <MicOff size={19} /> : <Mic size={19} />}
              {call.muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="voice-end" onClick={call.end}>
              <PhoneOff size={18} /> End call
            </button>
          </>
        ) : busy ? (
          <button type="button" className="voice-cancel" onClick={call.end}>
            <LoaderCircle size={18} className="spin" /> Cancel connection
          </button>
        ) : !call.ready && call.phase === 'failed' ? (
          <button type="button" className="voice-start" onClick={call.reload}>
            <RotateCcw size={18} /> Reload voice interface
          </button>
        ) : (
          <button
            type="button"
            className="voice-start"
            disabled={!consent || !call.ready}
            onClick={() => call.start(consent)}
          >
            {call.ready ? <Phone size={18} /> : <LoaderCircle size={18} className="spin" />}
            {!call.ready
              ? 'Loading voice interface…'
              : call.phase === 'idle'
                ? 'Start a conversation'
                : 'Start a new conversation'}
            <ArrowUpRight size={19} />
          </button>
        )}
      </div>
      <p className="voice-privacy">
        <ShieldCheck size={14} />
        <span>
          AI conversation · Audio and details are processed by our voice provider and may be
          recorded and stored for follow-up. Please don’t share sensitive information.
        </span>
      </p>
    </section>
  );
};
