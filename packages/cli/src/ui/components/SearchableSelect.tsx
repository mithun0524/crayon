import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
}

interface SearchableSelectProps {
  items: SelectOption[];
  onSelect: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  maxVisible?: number;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  items,
  onSelect,
  onCancel,
  placeholder = "Search...",
  maxVisible = 5
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredItems = items.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.value.toLowerCase().includes(query.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useInput((_, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }

    if (filteredItems.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(filteredItems.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(filteredItems[selectedIndex].value);
    }
  });

  let startIdx = 0;
  if (selectedIndex >= maxVisible) {
    startIdx = selectedIndex - maxVisible + 1;
  }
  const visibleItems = filteredItems.slice(startIdx, startIdx + maxVisible);

  return (
    <Box flexDirection="column">
      {/* Slim borderless list that hangs above the prompt (Claude Code-style). */}
      <Box flexDirection="row">
        <Text color={theme.subtle} dimColor>› </Text>
        <TextInput value={query} onChange={setQuery} placeholder={placeholder} />
      </Box>

      {filteredItems.length === 0 ? (
        <Text color={theme.subtle} dimColor>  no matches</Text>
      ) : (
        <React.Fragment>
          {startIdx > 0 && (
            <Text color={theme.subtle} dimColor>  ↑ {startIdx} more</Text>
          )}

          {visibleItems.map((item, idx) => {
            const actualIdx = startIdx + idx;
            const isSelected = selectedIndex === actualIdx;
            return (
              <Box key={item.value} flexDirection="row">
                <Box width={2}>
                  <Text color={theme.brand}>{isSelected ? "❯" : " "}</Text>
                </Box>
                <Box minWidth={14} marginRight={2}>
                  <Text color={isSelected ? theme.brand : theme.text} bold={isSelected}>
                    {item.label}
                  </Text>
                </Box>
                <Box>
                  <Text color={theme.subtle} dimColor={!isSelected}>
                    {item.description || ""}
                  </Text>
                </Box>
              </Box>
            );
          })}

          {startIdx + maxVisible < filteredItems.length && (
            <Text color={theme.subtle} dimColor>  ↓ {filteredItems.length - (startIdx + maxVisible)} more</Text>
          )}
        </React.Fragment>
      )}
    </Box>
  );
};
