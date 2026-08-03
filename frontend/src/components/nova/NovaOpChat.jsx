import { useState, useRef, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, TextField, Button, Chip, Stack, alpha,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import NovaLogo from './NovaLogo';
import { novaSpaceOpAPI } from '../../services/api';

const BRAND_GREEN = '#059669';
const BRAND_GREEN_DARK = '#047857';

const QUICK_PROMPTS = [
  { prompt: 'How many plants are connected?', label: 'Plant count' },
  { prompt: 'What is the pH?', label: 'pH level' },
  { prompt: 'How healthy is the plant?', label: 'Plant health' },
  { prompt: 'Show alerts', label: 'Alerts' },
];

function firstNameFromUser(name) {
  if (!name) return null;
  return name.trim().split(/\s+/)[0] || null;
}

function renderFormattedText(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function formatProvenance(provenance) {
  if (!provenance?.length) return null;
  const parts = provenance.map((p) => {
    const metric = p.metric || 'data';
    const tool = p.sourceTool ? ` via ${p.sourceTool}` : '';
    return `${metric}${tool}`;
  });
  return parts.join(' · ');
}

function MessageBubble({ message, onLinkClick }) {
  const isUser = message.role === 'user';
  return (
    <Box
      className="nova-chat-enter"
      sx={{
        mb: 1.75,
        display: 'flex',
        gap: 1,
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
      }}
    >
      {!isUser && (
        <Box sx={{ flexShrink: 0, mb: 0.25 }}>
          <NovaLogo size={28} />
        </Box>
      )}
      <Box sx={{ maxWidth: '88%', minWidth: 0 }}>
        <Paper
          elevation={0}
          sx={{
            px: 1.75,
            py: 1.25,
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            bgcolor: isUser ? BRAND_GREEN : '#ffffff',
            color: isUser ? '#fff' : '#0f172a',
            border: isUser ? 'none' : '1px solid',
            borderColor: '#e2e8f0',
            boxShadow: isUser ? `0 2px 8px ${alpha(BRAND_GREEN, 0.3)}` : 'none',
          }}
        >
          <Typography
            variant="body2"
            component="div"
            sx={{
              whiteSpace: 'pre-wrap',
              lineHeight: 1.55,
              wordBreak: 'break-word',
              fontSize: isUser ? '0.875rem' : '0.9375rem',
              fontWeight: isUser ? 500 : 400,
            }}
          >
            {renderFormattedText(message.content)}
          </Typography>
          {message.links?.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.5 }}>
              {message.links.map((link) => (
                <Chip
                  key={link.path || link.label}
                  label={link.label}
                  size="small"
                  clickable
                  onClick={() => onLinkClick?.(link.path)}
                  sx={{
                    height: 22,
                    fontSize: '0.7rem',
                    bgcolor: alpha(BRAND_GREEN, 0.08),
                    color: BRAND_GREEN_DARK,
                    border: `1px solid ${alpha(BRAND_GREEN, 0.2)}`,
                  }}
                />
              ))}
            </Stack>
          )}
          {message.toolsUsed?.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.5 }}>
              {message.toolsUsed.map((tool) => (
                <Chip
                  key={tool}
                  label={tool}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    bgcolor: alpha('#64748b', 0.08),
                    color: '#64748b',
                    border: '1px solid',
                    borderColor: alpha('#64748b', 0.15),
                  }}
                />
              ))}
            </Stack>
          )}
        </Paper>
        {message.provenanceLine && (
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 0.5, pl: 0.5, color: '#94a3b8', fontSize: '0.65rem' }}
          >
            Data fetched from: {message.provenanceLine}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function ChatHeader({ thinking, onClear, headerActions, compact }) {
  return (
    <Box
      sx={{
        px: 1.75,
        py: 1.25,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        flexShrink: 0,
        background: 'linear-gradient(135deg, rgba(207,250,254,0.9) 0%, #ffffff 45%, rgba(237,233,254,0.5) 100%)',
        borderBottom: '1px solid',
        borderColor: '#e2e8f0',
      }}
    >
      <NovaLogo size={compact ? 32 : 40} thinking={thinking} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ letterSpacing: '-0.02em', color: '#0f172a' }}>
          NOVA
        </Typography>
        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
          Your permission-aware plant assistant
        </Typography>
      </Box>
      <Chip
        label="Read-only"
        size="small"
        sx={{
          height: 20,
          fontSize: '0.625rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          bgcolor: alpha('#64748b', 0.08),
          color: '#64748b',
          border: 'none',
        }}
      />
      {onClear && (
        <Button
          size="small"
          startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
          onClick={onClear}
          sx={{
            minWidth: 0,
            px: 1,
            fontSize: '0.75rem',
            color: '#64748b',
            textTransform: 'none',
          }}
        >
          Clear
        </Button>
      )}
      {headerActions}
    </Box>
  );
}

export default function NovaOpChat({
  compact = false,
  showQuickPrompts = true,
  firstName,
  headerActions,
  showInternalHeader = false,
}) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [clarifyOptions, setClarifyOptions] = useState([]);
  const [cooldownSec, setCooldownSec] = useState(0);
  const bottomRef = useRef(null);
  const greetingName = firstNameFromUser(firstName) || 'there';
  const tip = QUICK_PROMPTS[0].prompt.toLowerCase();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (cooldownSec <= 0) return undefined;
    const t = setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownSec]);

  const inputLocked = loading || cooldownSec > 0;

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || inputLocked) return;
    setInput('');
    setClarifyOptions([]);
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const { data } = await novaSpaceOpAPI.chat({ message: msg, threadId });
      const res = data.data;
      if (res.threadId) setThreadId(res.threadId);
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: res.answer || 'NOVA could not answer that question.' },
        ]);
        return;
      }
      if (res.clarifyOptions?.length) setClarifyOptions(res.clarifyOptions);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.answer || 'No answer.',
          toolsUsed: res.toolsUsed,
          links: res.links,
          provenanceLine: formatProvenance(res.provenance),
        },
      ]);
    } catch (err) {
      const retryMs = err.response?.data?.data?.retryAfterMs || err.response?.data?.retryAfterMs;
      if (retryMs) setCooldownSec(Math.ceil(retryMs / 1000));
      const errMsg = err.response?.data?.message
        || err.response?.data?.data?.error
        || err.response?.data?.error
        || 'NOVA request failed. Please try again.';
      setMessages((prev) => [...prev, { role: 'assistant', content: errMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const onClarify = (option) => {
    sendMessage(`Use plant id ${option.id}`);
  };

  const onLinkClick = (path) => {
    if (path) navigate(path.startsWith('/') ? path : `/${path}`);
  };

  const handleClear = async () => {
    if (threadId) {
      try {
        await novaSpaceOpAPI.clearThread(threadId);
      } catch {
        /* ignore */
      }
    }
    setThreadId(null);
    setMessages([]);
    setClarifyOptions([]);
  };

  const showEmpty = messages.length === 0 && !loading;
  const maxChips = compact ? 4 : 6;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: compact ? '100%' : 'calc(100vh - 220px)',
        minHeight: compact ? 0 : 420,
        bgcolor: compact ? '#ffffff' : 'transparent',
        borderRadius: compact ? 0 : 2,
        overflow: 'hidden',
      }}
    >
      {showInternalHeader && (
        <ChatHeader
          thinking={loading}
          onClear={handleClear}
          headerActions={headerActions}
          compact={compact}
        />
      )}

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          px: 1.5,
          py: 1.5,
          bgcolor: '#f8fafc',
          backgroundImage: 'linear-gradient(180deg, rgba(248,250,252,0.95) 0%, #ffffff 100%)',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha('#000', 0.12),
            borderRadius: 3,
          },
        }}
      >
        {showEmpty && (
          <Box className="nova-chat-enter" sx={{ px: 1, py: 2 }}>
            <Typography
              variant={compact ? 'body1' : 'h6'}
              fontWeight={700}
              sx={{ color: '#0f172a', mb: 0.75 }}
            >
              Hi {greetingName} — I&apos;m NOVA.
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 2, lineHeight: 1.6 }}>
              Ask anything about your plants — for example {tip}.
            </Typography>
            {showQuickPrompts && (
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                {QUICK_PROMPTS.slice(0, maxChips).map((item) => (
                  <Chip
                    key={item.prompt}
                    label={item.label}
                    size="small"
                    clickable
                    onClick={() => sendMessage(item.prompt)}
                    sx={{
                      bgcolor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      color: '#334155',
                      '&:hover': { bgcolor: alpha(BRAND_GREEN, 0.06), borderColor: alpha(BRAND_GREEN, 0.3) },
                    }}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} onLinkClick={onLinkClick} />
        ))}

        {loading && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 0.5, py: 1 }}>
            <NovaLogo size={28} thinking />
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              Thinking…
            </Typography>
          </Stack>
        )}
        <div ref={bottomRef} />
      </Box>

      {clarifyOptions.length > 0 && (
        <Stack direction="row" spacing={0.75} sx={{ px: 1.5, py: 1, flexWrap: 'wrap', gap: 0.75, bgcolor: '#fff', borderTop: '1px solid #e2e8f0' }}>
          <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
            Select a plant:
          </Typography>
          {clarifyOptions.map((opt) => (
            <Chip
              key={opt.id}
              label={opt.label}
              onClick={() => onClarify(opt)}
              clickable
              size="small"
              sx={{
                bgcolor: alpha(BRAND_GREEN, 0.08),
                color: BRAND_GREEN_DARK,
                border: `1px solid ${alpha(BRAND_GREEN, 0.25)}`,
              }}
            />
          ))}
        </Stack>
      )}

      <Box
        sx={{
          px: 1.5,
          py: 1.25,
          borderTop: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            size="small"
            multiline
            maxRows={3}
            placeholder="Ask NOVA — e.g. plant health, pH, methane levels…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={inputLocked}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: '#f8fafc',
                fontSize: '0.875rem',
              },
            }}
          />
          <Button
            variant="contained"
            onClick={() => sendMessage()}
            disabled={inputLocked || !input.trim()}
            sx={{
              minWidth: 64,
              height: 40,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: BRAND_GREEN,
              boxShadow: 'none',
              '&:hover': { bgcolor: BRAND_GREEN_DARK, boxShadow: 'none' },
              '&.Mui-disabled': { bgcolor: alpha(BRAND_GREEN, 0.3) },
            }}
          >
            {loading ? '…' : cooldownSec > 0 ? `${cooldownSec}s` : 'Ask'}
          </Button>
        </Box>
        {!compact && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: '#94a3b8', fontSize: '0.6875rem' }}>
            Read-only insights from SWARM telemetry. NOVA never changes plant settings.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
