import React, { useState } from 'react';

const TagInput = ({ tags = [], onChange, suggestions = [], placeholder = "Add tags..." }) => {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Filter suggestions to show those matching input and not already selected
  const filteredSuggestions = suggestions.filter(
    sugg => sugg.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(sugg)
  );

  const addTag = (tag) => {
    const cleanTag = tag.trim().toLowerCase();
    if (cleanTag && !tags.includes(cleanTag)) {
      onChange([...tags, cleanTag]);
    }
    setInputValue('');
    setShowDropdown(false);
    setActiveIndex(-1);
  };

  const removeTag = (indexToRemove) => {
    onChange(tags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
        addTag(filteredSuggestions[activeIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredSuggestions.length > 0) {
        setActiveIndex(prev => (prev + 1) % filteredSuggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredSuggestions.length > 0) {
        setActiveIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIndex(-1);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div className="tag-input-container">
      {tags.map((tag, idx) => (
        <span key={idx} className="tag-input-pill">
          {tag}
          <span 
            className="tag-input-pill-remove" 
            onClick={(e) => {
              e.stopPropagation();
              removeTag(idx);
            }}
          >
            &times;
          </span>
        </span>
      ))}
      <input
        type="text"
        className="tag-input-field"
        placeholder={tags.length === 0 ? placeholder : ''}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setShowDropdown(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => {
          // Delay to let mouse down event on dropdown register
          setTimeout(() => setShowDropdown(false), 200);
        }}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && (inputValue || filteredSuggestions.length > 0) && (
        <div className="tag-autocomplete-dropdown">
          {filteredSuggestions.length > 0 ? (
            filteredSuggestions.map((sugg, idx) => (
              <div
                key={idx}
                className={`tag-autocomplete-item ${idx === activeIndex ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents blur event
                  addTag(sugg);
                }}
              >
                {sugg}
              </div>
            ))
          ) : (
            inputValue.trim() && !tags.includes(inputValue.trim().toLowerCase()) && (
              <div 
                className="tag-autocomplete-item active" 
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents blur event
                  addTag(inputValue);
                }}
              >
                Create "{inputValue.trim().toLowerCase()}"
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default TagInput;
