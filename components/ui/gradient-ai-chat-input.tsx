"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Send, AtSign, X, Check, User, Handshake } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface GradientColors {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
}

interface ThemeGradients {
  light: GradientColors;
  dark: GradientColors;
}

export interface MentionItem {
  id: string;
  type: "contact" | "deal";
  label: string;
  subtitle?: string;
}

interface GradientAIChatInputProps {
  placeholder?: string;
  onSend?: (message: string, mentions: MentionItem[]) => void;
  enableAnimations?: boolean;
  className?: string;
  disabled?: boolean;
  // Mention search
  onMentionSearch?: (query: string) => Promise<MentionItem[]>;
  // Gradient customization
  mainGradient?: ThemeGradients;
  outerGradient?: ThemeGradients;
  innerGradientOpacity?: number;
  buttonBorderColor?: { light: string; dark: string };
  // Shadow customization
  enableShadows?: boolean;
  shadowOpacity?: number;
  shadowColor?: { light: string; dark: string };
}

export function GradientAIChatInput({
  placeholder = "Send message...",
  onSend,
  enableAnimations = true,
  className,
  disabled = false,
  onMentionSearch,
  mainGradient = {
    light: {
      topLeft: "#F5E9AD",
      topRight: "#F6B4AD",
      bottomRight: "#F5ABA0",
      bottomLeft: "#F5DCBA",
    },
    dark: {
      topLeft: "#B8905A",
      topRight: "#B86B42",
      bottomRight: "#A8502D",
      bottomLeft: "#B89E6E",
    },
  },
  outerGradient = {
    light: {
      topLeft: "#E5D99D",
      topRight: "#E6A49D",
      bottomRight: "#E59B90",
      bottomLeft: "#E5CCBA",
    },
    dark: {
      topLeft: "#996F40",
      topRight: "#99532D",
      bottomRight: "#8A3F22",
      bottomLeft: "#997D50",
    },
  },
  innerGradientOpacity = 0.1,
  buttonBorderColor = {
    light: "#DBDBD8",
    dark: "#4A4A4A",
  },
  enableShadows = true,
  shadowOpacity = 1,
  shadowColor = {
    light: "rgb(0, 0, 0)",
    dark: "rgb(184, 107, 66)",
  },
}: GradientAIChatInputProps) {
  const [message, setMessage] = useState("");
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<MentionItem[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;
  const mentionRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { theme } = useTheme();

  const isDark = theme === "dark";
  const currentMainGradient = isDark ? mainGradient.dark : mainGradient.light;
  const currentOuterGradient = isDark ? outerGradient.dark : outerGradient.light;
  const currentButtonBorderColor = isDark
    ? buttonBorderColor.dark
    : buttonBorderColor.light;
  const currentShadowColor = isDark ? shadowColor.dark : shadowColor.light;

  const hexToRgba = (color: string, alpha: number): string => {
    if (color.startsWith("rgb(")) {
      const rgbValues = color
        .slice(4, -1)
        .split(",")
        .map((val) => parseInt(val.trim()));
      return `rgba(${rgbValues[0]}, ${rgbValues[1]}, ${rgbValues[2]}, ${alpha})`;
    }
    if (color.startsWith("#")) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  };

  // Close mention dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionRef.current &&
        !mentionRef.current.contains(event.target as Node)
      ) {
        setMentionOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search for mentions when query changes
  const searchMentions = useCallback(
    async (q: string) => {
      if (!onMentionSearch) return;
      setMentionLoading(true);
      try {
        const results = await onMentionSearch(q);
        setMentionResults(results);
        setHighlightedIndex(0);
      } finally {
        setMentionLoading(false);
      }
    },
    [onMentionSearch]
  );

  useEffect(() => {
    if (mentionOpen) {
      const timer = setTimeout(() => searchMentions(mentionQuery), 200);
      return () => clearTimeout(timer);
    }
  }, [mentionQuery, mentionOpen, searchMentions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && onSend && !disabled) {
      onSend(message.trim(), mentions);
      setMessage("");
      setMentions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < mentionResults.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : mentionResults.length - 1
        );
        return;
      }
      if (e.key === "Enter" && mentionResults.length > 0) {
        e.preventDefault();
        selectMention(mentionResults[highlightedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const selectMention = (item: MentionItem) => {
    if (!mentions.find((m) => m.id === item.id && m.type === item.type)) {
      setMentions((prev) => [...prev, item]);
    }
    setMentionOpen(false);
    setMentionQuery("");
    textareaRef.current?.focus();
  };

  const removeMention = (item: MentionItem) => {
    setMentions((prev) =>
      prev.filter((m) => !(m.id === item.id && m.type === item.type))
    );
  };

  const openMentionDropdown = () => {
    setMentionOpen(true);
    setMentionQuery("");
    searchMentions("");
  };

  return (
    <motion.div
      className={cn("relative", className)}
      initial={shouldAnimate ? { opacity: 0, y: 20 } : {}}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
      }}
    >
      {/* Main container with multi-layer gradient border */}
      <div className="relative">
        {/* Outer thin border */}
        <div
          className="absolute inset-0 rounded-[20px] p-[0.5px]"
          style={{
            background: `conic-gradient(from 0deg at 50% 50%,
              ${currentOuterGradient.topLeft} 0deg,
              ${currentOuterGradient.topRight} 90deg,
              ${currentOuterGradient.bottomRight} 180deg,
              ${currentOuterGradient.bottomLeft} 270deg,
              ${currentOuterGradient.topLeft} 360deg
            )`,
          }}
        >
          {/* Main thick border */}
          <div
            className="h-full w-full rounded-[19.5px] p-[2px]"
            style={{
              background: `conic-gradient(from 0deg at 50% 50%,
                ${currentMainGradient.topLeft} 0deg,
                ${currentMainGradient.topRight} 90deg,
                ${currentMainGradient.bottomRight} 180deg,
                ${currentMainGradient.bottomLeft} 270deg,
                ${currentMainGradient.topLeft} 360deg
              )`,
            }}
          >
            {/* Inner container */}
            <div className="h-full w-full rounded-[17.5px] bg-background relative">
              {/* Inner thin border */}
              <div
                className="absolute inset-0 rounded-[17.5px] p-[0.5px]"
                style={{
                  background: `conic-gradient(from 0deg at 50% 50%,
                    ${hexToRgba(currentOuterGradient.topLeft, innerGradientOpacity)} 0deg,
                    ${hexToRgba(currentOuterGradient.topRight, innerGradientOpacity)} 90deg,
                    ${hexToRgba(currentOuterGradient.bottomRight, innerGradientOpacity)} 180deg,
                    ${hexToRgba(currentOuterGradient.bottomLeft, innerGradientOpacity)} 270deg,
                    ${hexToRgba(currentOuterGradient.topLeft, innerGradientOpacity)} 360deg
                  )`,
                }}
              >
                <div className="h-full w-full rounded-[17px] bg-background" />
              </div>
              {/* Top highlight */}
              <div
                className="absolute top-0 left-4 right-4 h-[0.5px] bg-gradient-to-r from-transparent via-[var(--top-highlight)]/30 to-transparent"
                style={
                  {
                    "--top-highlight": currentMainGradient.topLeft,
                  } as React.CSSProperties
                }
              />
              {/* Bottom highlight */}
              <div
                className="absolute bottom-0 left-4 right-4 h-[0.5px] bg-gradient-to-r from-transparent via-[var(--bottom-highlight)]/20 to-transparent"
                style={
                  {
                    "--bottom-highlight": currentMainGradient.bottomRight,
                  } as React.CSSProperties
                }
              />
            </div>
          </div>
        </div>

        {/* Content container */}
        <div className="relative p-4">
          {/* Top row: Text input + Send button */}
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                className={cn(
                  "w-full resize-none border-0 bg-transparent",
                  "text-foreground placeholder:text-muted-foreground",
                  "text-base leading-6 py-2 px-0",
                  "focus:outline-none focus:ring-0 outline-none",
                  "overflow-hidden",
                  "transition-colors duration-200",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  minHeight: "40px",
                  maxHeight: "120px",
                  height: "auto",
                  outline: "none !important",
                  boxShadow: "none !important",
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height =
                    Math.min(target.scrollHeight, 120) + "px";
                }}
              />
            </div>
            {/* Send button */}
            <motion.button
              type="submit"
              onClick={handleSubmit}
              disabled={disabled || !message.trim()}
              className={cn(
                "flex items-center justify-center",
                "w-8 h-8 mt-1",
                "text-muted-foreground hover:text-foreground",
                "transition-colors cursor-pointer",
                (disabled || !message.trim()) &&
                  "opacity-50 cursor-not-allowed"
              )}
              whileHover={
                shouldAnimate && message.trim() ? { scale: 1.1 } : {}
              }
              whileTap={
                shouldAnimate && message.trim() ? { scale: 0.9 } : {}
              }
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
              }}
            >
              <Send className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Bottom row: @ Mention button + mention pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* @ Mention button */}
            <div className="relative" ref={mentionRef}>
              <motion.button
                type="button"
                onClick={openMentionDropdown}
                disabled={disabled}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5",
                  "text-sm text-muted-foreground hover:text-foreground",
                  "rounded-full transition-colors cursor-pointer",
                  "bg-muted/30 hover:bg-muted/50",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                style={{
                  border: `1px solid ${currentButtonBorderColor}`,
                }}
                whileHover={shouldAnimate ? { scale: 1.02 } : {}}
                whileTap={shouldAnimate ? { scale: 0.98 } : {}}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                }}
              >
                <AtSign className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mention</span>
              </motion.button>

              {/* Mention dropdown */}
              {mentionOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  className="absolute bottom-full mb-2 left-0 bg-popover border border-border rounded-lg shadow-lg w-72 z-50"
                >
                  <div className="p-2 border-b border-border">
                    <input
                      autoFocus
                      type="text"
                      value={mentionQuery}
                      onChange={(e) => setMentionQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Search contacts or deals..."
                      className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground text-foreground px-1 py-1"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1">
                    {mentionLoading ? (
                      <div className="text-xs text-muted-foreground text-center py-4">
                        Searching...
                      </div>
                    ) : mentionResults.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-4">
                        No results found
                      </div>
                    ) : (
                      mentionResults.map((item, index) => (
                        <button
                          key={`${item.type}-${item.id}`}
                          onClick={() => selectMention(item)}
                          className={cn(
                            "w-full text-left px-2 py-2 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2",
                            highlightedIndex === index && "bg-accent",
                            mentions.find(
                              (m) =>
                                m.id === item.id && m.type === item.type
                            ) && "opacity-50"
                          )}
                        >
                          <div
                            className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                              item.type === "contact"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            )}
                          >
                            {item.type === "contact" ? (
                              <User className="w-3 h-3" />
                            ) : (
                              <Handshake className="w-3 h-3" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.label}
                            </p>
                            {item.subtitle && (
                              <p className="text-xs text-muted-foreground truncate">
                                {item.subtitle}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                              item.type === "contact"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            )}
                          >
                            {item.type === "contact" ? "Contact" : "Deal"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Separator + mention pills */}
            {mentions.length > 0 && (
              <div
                className="h-6 w-px"
                style={{ backgroundColor: currentButtonBorderColor }}
              />
            )}
            {mentions.map((item) => (
              <motion.div
                key={`${item.type}-${item.id}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1",
                  "text-sm rounded-full border",
                  item.type === "contact"
                    ? "bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-300"
                    : "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                )}
              >
                {item.type === "contact" ? (
                  <User className="w-3 h-3" />
                ) : (
                  <Handshake className="w-3 h-3" />
                )}
                <span className="truncate max-w-[120px] text-xs font-medium">
                  {item.label}
                </span>
                <button
                  onClick={() => removeMention(item)}
                  className="flex-shrink-0 w-4 h-4 rounded-full bg-foreground/10 hover:bg-destructive/20 flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Shadow system */}
        {enableShadows && (
          <>
            <div
              className="absolute -bottom-3 left-3 right-3 h-6 rounded-full blur-md"
              style={{
                opacity: shadowOpacity,
                background: `linear-gradient(to bottom, ${hexToRgba(currentShadowColor, 0.1)} 0%, transparent 100%)`,
              }}
            />
            <div
              className="absolute -left-2 top-3 bottom-3 w-4 rounded-full blur-sm"
              style={{
                opacity: shadowOpacity,
                background: `linear-gradient(to right, ${hexToRgba(currentShadowColor, 0.06)} 0%, transparent 100%)`,
              }}
            />
            <div
              className="absolute -right-2 top-3 bottom-3 w-4 rounded-full blur-sm"
              style={{
                opacity: shadowOpacity,
                background: `linear-gradient(to left, ${hexToRgba(currentShadowColor, 0.06)} 0%, transparent 100%)`,
              }}
            />
            <div
              className="absolute inset-0 rounded-[20px] shadow-lg pointer-events-none"
              style={{
                opacity: shadowOpacity,
                boxShadow: `0 10px 25px ${hexToRgba(currentShadowColor, isDark ? 0.15 : 0.05)}`,
              }}
            />
          </>
        )}
      </div>
    </motion.div>
  );
}
