import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CustomDropdownOption {
  value: string;
  label: string;
  subLabel?: string;
  colorHex?: string;
  group?: string;
}

export interface CustomSelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomDropdownOption[];
  placeholder?: string;
  icon?: React.ReactNode;
  defaultAllValue?: string;
  size?: 'sm' | 'md';
  className?: string;
  menuClassName?: string;
  title?: string;
  ariaLabel?: string;
  id?: string;
}

export const CustomSelectDropdown: React.FC<CustomSelectDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  icon,
  defaultAllValue,
  size = 'sm',
  className = '',
  menuClassName = '',
  title,
  ariaLabel,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);
  const isFiltered =
    defaultAllValue !== undefined ? value !== defaultAllValue : Boolean(value && value !== '');

  const heightClass = size === 'sm' ? 'h-8' : 'h-9';

  // Group options if any option specifies a group
  const hasGroups = options.some((o) => Boolean(o.group));

  const renderOptionButton = (opt: CustomDropdownOption) => {
    const isSelected = opt.value === value;
    return (
      <button
        key={`${opt.group || 'ungrouped'}-${opt.value}`}
        type="button"
        onClick={() => {
          onChange(opt.value);
          setIsOpen(false);
        }}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 cursor-pointer transition-colors text-left ${
          isSelected ? 'bg-sky-50/70 hover:bg-sky-100/70' : 'hover:bg-slate-50'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div
            className={`text-xs truncate ${
              isSelected ? 'text-[#0c4da2] font-bold' : 'text-slate-700 font-semibold'
            }`}
          >
            {opt.label}
          </div>
          {opt.subLabel && (
            <div className="text-[10px] text-slate-500 truncate mt-0.5">{opt.subLabel}</div>
          )}
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          {opt.colorHex ? (
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 border ${
                isSelected ? 'ring-2 ring-[#0c4da2] ring-offset-1 border-white' : 'border-black/10'
              }`}
              style={{ backgroundColor: opt.colorHex }}
            />
          ) : (
            isSelected && <span className="w-2 h-2 rounded-full bg-[#0c4da2] shrink-0" />
          )}
        </span>
      </button>
    );
  };

  const renderGroupedOptions = () => {
    const ungrouped: CustomDropdownOption[] = [];
    const groupsMap = new Map<string, CustomDropdownOption[]>();

    options.forEach((opt) => {
      if (!opt.group) {
        ungrouped.push(opt);
      } else {
        const list = groupsMap.get(opt.group) || [];
        list.push(opt);
        groupsMap.set(opt.group, list);
      }
    });

    return (
      <>
        {ungrouped.map(renderOptionButton)}
        {Array.from(groupsMap.entries()).map(([groupName, groupOpts]) => (
          <div key={groupName} className="pt-1">
            <div className="px-3.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/80 border-y border-slate-100">
              {groupName}
            </div>
            {groupOpts.map(renderOptionButton)}
          </div>
        ))}
      </>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={title}
        aria-label={ariaLabel || title}
        aria-expanded={isOpen}
        className={`${heightClass} w-full flex items-center justify-between gap-2 px-3 rounded-xl border transition-all text-xs font-semibold cursor-pointer select-none shadow-2xs ${
          isFiltered
            ? 'bg-sky-50 border-sky-300 text-sky-950 ring-1 ring-sky-300/60'
            : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
        }`}
      >
        <span className="flex items-center gap-2 truncate min-w-0">
          {icon && <span className="shrink-0 flex items-center">{icon}</span>}
          {selectedOption?.colorHex && (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15"
              style={{ backgroundColor: selectedOption.colorHex }}
            />
          )}
          <span className="font-bold truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {isFiltered && <span className="w-2 h-2 rounded-full bg-[#0c4da2]" />}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </span>
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 mt-1.5 w-full min-w-[220px] max-h-72 overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 select-none ${menuClassName}`}
        >
          {hasGroups ? renderGroupedOptions() : options.map(renderOptionButton)}
        </div>
      )}
    </div>
  );
};
