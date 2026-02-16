// admin-frontend/src/components/admin/ColorSelector.tsx

import { useState, useEffect, ChangeEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils"; // Utilitário do ShadCN para mesclar classes

interface ColorSelectorProps {
  label?: string;
  color: string; // Cor atual no formato HEX (ex: "#RRGGBB")
  onChange: (newColor: string) => void; // Função chamada quando a cor muda
  className?: string;
  predefinedColors?: string[]; // Array opcional de cores HEX para uma paleta rápida
}

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/i; // Aceita #RGB ou #RRGGBB

const defaultPredefinedColors = [
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#0EA5E9",
  "#6366F1",
  "#A855F7",
  "#EC4899",
  "#78716C",
  "#000000",
  "#CBD5E1",
];

export function ColorSelector({
  label = "Escolha uma Cor",
  color, // Esta é a cor vinda do estado pai (ex: formData.themeColor)
  onChange,
  className,
  predefinedColors = defaultPredefinedColors,
}: ColorSelectorProps) {
  // Estado interno para o valor do input de texto, para permitir digitação livre
  const [inputValue, setInputValue] = useState(color);
  // Estado interno para o valor do seletor de cor nativo (que também usa HEX)
  const [pickerValue, setPickerValue] = useState(color);
  const [isValidHex, setIsValidHex] = useState(HEX_COLOR_REGEX.test(color));

  // Sincroniza os estados internos se a prop 'color' mudar externamente
  useEffect(() => {
    setInputValue(color);
    setPickerValue(color);
    setIsValidHex(HEX_COLOR_REGEX.test(color));
  }, [color]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newHex = e.target.value.toUpperCase();
    setInputValue(newHex);
    const valid = HEX_COLOR_REGEX.test(newHex);
    setIsValidHex(valid);
    if (valid) {
      setPickerValue(newHex); // Sincroniza o seletor nativo
      onChange(newHex); // Propaga a mudança para o componente pai
    }
  };

  const handleColorPickerChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newHex = e.target.value.toUpperCase();
    setPickerValue(newHex);
    setInputValue(newHex); // Sincroniza o input de texto
    setIsValidHex(true); // O seletor nativo sempre retorna um HEX válido
    onChange(newHex); // Propaga a mudança
  };

  const handlePaletteClick = (paletteColor: string) => {
    const upperPaletteColor = paletteColor.toUpperCase();
    setInputValue(upperPaletteColor);
    setPickerValue(upperPaletteColor);
    setIsValidHex(true);
    onChange(upperPaletteColor);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label htmlFor="hex-color-input" className="text-sm font-medium">
          {label}
        </Label>
      )}
      <div className="flex items-center gap-3">
        {/* Seletor de Cor Nativo HTML5 (estilizado para parecer um swatch) */}
        <div className="relative h-10 w-10 flex-shrink-0">
          <input
            type="color"
            id="native-color-picker"
            value={pickerValue} // Controlado pelo estado pickerValue
            onChange={handleColorPickerChange}
            // Esconde o input nativo, mas o deixa funcional
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {/* Aparência customizada que aciona o input nativo */}
          <button
            type="button"
            className="h-full w-full rounded-md border border-input shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            style={{ backgroundColor: isValidHex ? inputValue : color || "#FFFFFF" }} // Mostra a cor atual ou a do input se válida
            onClick={() => document.getElementById("native-color-picker")?.click()}
            title="Abrir seletor de cores"
          />
        </div>

        {/* Input de Texto para Código HEX */}
        <Input
          id="hex-color-input"
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="#RRGGBB"
          maxLength={7}
          className={cn(
            "font-mono w-full", // font-mono ajuda na leitura de códigos HEX
            !isValidHex && inputValue.length > 0 ? "border-red-500 focus-visible:ring-red-500" : ""
          )}
        />
      </div>
      {!isValidHex && inputValue.length > 0 && <p className="text-xs text-red-500">Formato HEX inválido (ex: #FF0000 ou #F00).</p>}

      {/* Paleta de Cores Predefinidas (Opcional) */}
      {predefinedColors && predefinedColors.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Sugestões de cores:</p>
          <div className="flex flex-wrap gap-2">
            {predefinedColors.map((pColor) => (
              <button
                type="button"
                key={pColor}
                title={pColor}
                className="h-6 w-6 rounded-sm border hover:scale-110 focus:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                style={{ backgroundColor: pColor }}
                onClick={() => handlePaletteClick(pColor)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
