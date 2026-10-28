import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Delete, X, AlertTriangle, KeyRound } from 'lucide-react';
import { safeStorage } from '../utils/safeStorage';

interface SupervisorPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle?: string;
  actionDescription?: string;
  requiredRole?: 'ADMINISTRADOR' | 'SUPERVISOR';
}

export const SupervisorPinModal: React.FC<SupervisorPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'Autorización de Administrador',
  actionDescription = '',
  requiredRole = 'ADMINISTRADOR'
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Reset PIN on open
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyPress = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError('');
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const verifyPin = (candidatePin: string) => {
    const storedAdminPin = safeStorage.getItem('pos_admin_pin');
    let isAdminValid = false;

    // 1. Verificar contra usuarios con rol de Administrador o Supervisor
    try {
      const storedUsersStr = safeStorage.getItem('sabor_cervanteno_users');
      if (storedUsersStr) {
        const users = JSON.parse(storedUsersStr);
        if (Array.isArray(users)) {
          isAdminValid = users.some(
            (u: any) => u.active && (u.role === 'ADMINISTRADOR' || u.role === 'SUPERVISOR') && u.pinCode === candidatePin
          );
        }
      }
    } catch (e) {
      console.warn('Error verificando usuarios en SupervisorPinModal:', e);
    }

    // 2. Verificar contra PIN de administrador en localStorage
    if (!isAdminValid && storedAdminPin) {
      isAdminValid = candidatePin === storedAdminPin;
    }

    // 3. Fallback de fábrica predeterminado SOLO si nunca se ha configurado un PIN
    if (!isAdminValid && !storedAdminPin && candidatePin === '9999') {
      isAdminValid = true;
    }

    if (isAdminValid) {
      setError('');
      onSuccess();
      onClose();
    } else {
      setError('PIN incorrecto. Intente de nuevo.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-5 border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                Seguridad & Control
              </span>
              <h3 className="text-base font-black text-stone-900 leading-tight">
                {actionTitle}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PIN Display (4 Dots) */}
        <div className="space-y-2 text-center pt-2">
          <div className="flex justify-center items-center gap-3 py-2">
            {[0, 1, 2, 3].map((index) => {
              const isFilled = pin.length > index;
              return (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full transition-all duration-150 ${
                    isFilled 
                      ? 'bg-amber-600 scale-110 shadow-sm ring-2 ring-amber-300' 
                      : 'border-2 border-stone-300 bg-stone-100'
                  }`}
                />
              );
            })}
          </div>

          {error && (
            <p className="text-xs font-bold text-rose-600 flex items-center justify-center gap-1 animate-shake">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </p>
          )}
        </div>

        {/* Touch Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
              className="py-3 text-lg font-black bg-stone-50 hover:bg-amber-50 active:bg-amber-100 border border-stone-200 text-stone-800 rounded-2xl transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            className="py-3 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-600 border border-stone-200 rounded-2xl transition-all cursor-pointer"
          >
            Borrar
          </button>

          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="py-3 text-lg font-black bg-stone-50 hover:bg-amber-50 active:bg-amber-100 border border-stone-200 text-stone-800 rounded-2xl transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            className="py-3 flex items-center justify-center bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 rounded-2xl transition-all cursor-pointer"
            title="Retroceso"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

      </div>
    </div>
  );
};
