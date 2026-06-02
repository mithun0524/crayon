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
      <Box flexDirection="row" marginBottom={1}>
        <Text color={theme.success}> ❯ </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder={placeholder}
        />
      </Box>

      <Box flexDirection="column" paddingLeft={1} borderStyle="round" borderColor={theme.border} paddingX={1}>
        {filteredItems.length === 0 ? (
          <Text color={theme.subtle}>No matches found</Text>
        ) : (
          <React.Fragment>
            {startIdx > 0 && (
              <Box flexDirection="row" marginBottom={1}>
                <Box width={3}></Box>
                <Text color={theme.subtle} italic>... ({startIdx} more above)</Text>
              </Box>
            )}

            {visibleItems.map((item, idx) => {
              const actualIdx = startIdx + idx;
              const isSelected = selectedIndex === actualIdx;

              return (
                <Box key={item.value} flexDirection="row">
                  <Box width={3}>
                    <Text color={isSelected ? "white" : theme.subtle} bold={isSelected}>
                      {isSelected ? " ❯ " : "   "}
                    </Text>
                  </Box>
                  <Box minWidth={15} marginRight={2}>
                    <Text color={isSelected ? "white" : theme.success} bold={isSelected}>
                      {item.label}
                    </Text>
                  </Box>
                  <Box>
                    <Text color={isSelected ? "white" : theme.subtle}>
                      {item.description || ""}
                    </Text>
                  </Box>
                </Box>
              );
            })}

            {startIdx + maxVisible < filteredItems.length && (
              <Box flexDirection="row" marginTop={1}>
                <Box width={3}></Box>
                <Text color={theme.subtle} italic>... ({filteredItems.length - (startIdx + maxVisible)} more below)</Text>
              </Box>
            )}
          </React.Fragment>
        )}
      </Box>
    </Box>
  );
};
