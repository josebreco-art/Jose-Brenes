import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, 
  Shield, 
  UserCheck, 
  Delete, 
  KeyRound, 
  Store, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Sparkles, 
  Lock,
  ChefHat,
  Tag,
  Calendar
} from 'lucide-react';
import { UserProfile, CashRegister, LocationType } from '../types/pos';
import { SYSTEM_USERS } from '../data/initialData';
import { PosApiService } from '../services/api';
import { safeStorage } from '../utils/safeStorage';
import { getInstalledVersionName, formatInstalledDateTime } from '../utils/version';

interface LoginScreenProps {
  onLogin: (user: UserProfile) => void;
  onOpenKdsGeneral?: () => void;
  isOnline: boolean;
  cashRegister: CashRegister | null;
  location: LocationType;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  onOpenKdsGeneral,
  isOnline,
  cashRegister,
  location
}) => {
  // Real-time clock state
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Dynamic users loaded from DB
  const [usersList, setUsersList] = useState<UserProfile[]>([...SYSTEM_USERS]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);

  // Load registered users from API/LocalStorage
  useEffect(() => {
    PosApiService.getUsers().then(users => {
      if (users && users.length > 0) {
        setUsersList(users);
        setSelectedUser(prev => {
          if (prev) {
            const updatedPrev = users.find(u => u.id === prev.id);
            if (updatedPrev) return updatedPrev;
          }
          return users.find(u => u.active && u.role === 'CAJERO') || users[0];
        });
      }
    }).catch(err => {
      console.warn('Could not load users in LoginScreen:', err);
    });
  }, []);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard listener for physical numpad typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
        handleClear();
      } else if (e.key === 'Enter') {
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, selectedUser, usersList]);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError('');
      if (nextPin.length === 4) {
        verifyAndSubmit(nextPin, selectedUser);
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

  const verifyAndSubmit = (enteredPin: string, targetUser: UserProfile | null) => {
    const adminPin = safeStorage.getItem('pos_admin_pin') || '9999';

    // 1. If a specific targetUser is selected, validate strictly against their PIN (or Master Admin PIN)
    if (targetUser) {
      if (targetUser.pinCode === enteredPin || enteredPin === adminPin || enteredPin === '9999') {
        // If master admin PIN was entered, log in as admin (or targetUser if admin)
        const loggedUser = (enteredPin === adminPin || enteredPin === '9999') 
          ? (usersList.find(u => u.role === 'ADMINISTRADOR') || targetUser)
          : targetUser;
        handleSuccessLogin(loggedUser);
        return;
      }

      // PIN did not match the selected targetUser
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setError(`PIN incorrecto para ${targetUser.name}. Ingrese la clave correcta.`);
      setPin('');
      return;
    }

    // 2. Scan ALL active users if no targetUser selected
    const matchedUser = usersList.find(u => u.active && u.pinCode === enteredPin);
    if (matchedUser) {
      setSelectedUser(matchedUser);
      handleSuccessLogin(matchedUser);
      return;
    }

    // 3. Fallback check for admin PIN
    if (enteredPin === adminPin || enteredPin === '9999') {
      const adminUser = usersList.find(u => u.role === 'ADMINISTRADOR') || SYSTEM_USERS[0];
      handleSuccessLogin(adminUser);
      return;
    }

    const cashierPin = safeStorage.getItem('pos_cashier_pin');
    if (cashierPin && enteredPin === cashierPin) {
      const cashierUser = usersList.find(u => u.role === 'CAJERO') || SYSTEM_USERS[1];
      handleSuccessLogin(cashierUser);
      return;
    }

    // PIN is invalid
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
    setError('PIN incorrecto. Ingrese una clave de 4 dígitos válida.');
    setPin('');
  };

  const handleSuccessLogin = (user: UserProfile) => {
    setError('');
    setSuccessMsg(`¡Bienvenido ${user.name}! Accediendo al sistema...`);
    setTimeout(() => {
      onLogin({
        ...user,
        location: location
      });
    }, 350);
  };

  const handleSubmit = () => {
    if (pin.length < 4) {
      setError('Por favor ingrese el PIN de 4 dígitos.');
      return;
    }
    verifyAndSubmit(pin, selectedUser);
  };

  const handleQuickFill = (demoPin: string, role: 'CAJERO' | 'ADMINISTRADOR') => {
    const user = usersList.find(u => u.role === role) || (role === 'ADMINISTRADOR' ? SYSTEM_USERS[0] : SYSTEM_USERS[1]);
    setSelectedUser(user);
    setPin(demoPin);
    setError('');
    verifyAndSubmit(demoPin, user);
  };

  // Formatted date & time strings (Costa Rica locale)
  const timeString = currentTime.toLocaleTimeString('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const dateString = currentTime.toLocaleDateString('es-CR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Versión instalada basada en la fecha y hora de instalación del sistema
  const installedVersionName = useMemo(() => getInstalledVersionName(), []);
  const installedDateTimeFormatted = useMemo(() => formatInstalledDateTime(), []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-amber-950 via-stone-950 to-amber-950 text-white flex flex-col justify-between p-4 sm:p-6 select-none">
      
      {/* Top Bar: Location & Live System Status */}
      <div className="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 text-xs bg-amber-900/30 backdrop-blur-md border border-amber-800/50 rounded-2xl px-4 py-2.5 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="text-lg">📍</span>
          <div>
            <span className="font-bold text-amber-200">Sucursal Cervantes</span>
            <span className="text-stone-400 text-[11px] ml-1.5 hidden sm:inline">Alvarado, Cartago • Terminal 00001</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Internet status */}
          <div 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
              isOnline 
                ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300' 
                : 'bg-rose-950/80 border-rose-600 text-rose-300'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-rose-400" />}
            <span>{isOnline ? 'En Línea (Cloud)' : 'Modo Offline'}</span>
          </div>

          {/* Cash Register state */}
          <div 
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
              cashRegister?.status === 'OPEN'
                ? 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300'
                : 'bg-amber-950/80 border-amber-600/70 text-amber-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${cashRegister?.status === 'OPEN' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span>{cashRegister?.status === 'OPEN' ? 'Caja Abierta' : 'Caja Cerrada'}</span>
          </div>

          {/* DGT badge */}
          <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-900/80 border border-stone-700 text-[11px] text-stone-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hacienda DGT v4.4</span>
          </div>
        </div>
      </div>

      {/* Center Section: Branding, Clock & Login Card */}
      <div className="max-w-4xl w-full mx-auto my-auto py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        
        {/* Left Column: Brand & Big Live Clock */}
        <div className="lg:col-span-6 flex flex-col items-center lg:items-start text-center lg:text-left space-y-4 w-full">
          
          {/* Botón de Acceso Rápido: Pantalla de Cocina (KDS General) */}
          {onOpenKdsGeneral && (
            <button
              type="button"
              onClick={onOpenKdsGeneral}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:via-orange-500 hover:to-amber-600 active:scale-[0.99] text-white rounded-2xl p-3 sm:p-3.5 border-2 border-amber-400/80 shadow-2xl hover:shadow-orange-500/30 transition-all flex items-center justify-between gap-3 text-left cursor-pointer"
              title="Abrir directamente la pantalla de cocina KDS mostrando todas las comandas"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-950/70 border border-amber-300/40 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                  <ChefHat className="w-6 h-6 text-amber-200" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-100">
                      Pantalla Cocina (KDS)
                    </span>
                    <span className="text-[10px] font-extrabold bg-amber-950/90 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/50">
                      General
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-100/90 font-medium">
                    Todas las comandas en vivo • Acceso directo
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0 text-amber-200 group-hover:translate-x-1 transition-transform">
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* Logo Badge */}
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-amber-900/50 border border-amber-600/50 shadow-inner">
            <span className="text-3xl animate-bounce">🍗</span>
            <div>
              <h1 className="text-xl font-black tracking-wider text-amber-200 uppercase">
                Sabor Cervanteño
              </h1>
              <p className="text-[11px] text-amber-400 font-semibold tracking-wide">
                Pollo Frito & Comidas Rápidas
              </p>
            </div>
          </div>

          {/* Large Live Digital Clock Card */}
          <div className="w-full bg-stone-900/90 backdrop-blur-md border border-amber-700/40 rounded-3xl p-5 shadow-2xl space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-400 border-b border-stone-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '60s' }} />
                <span className="font-semibold text-stone-300 uppercase tracking-wider text-[11px]">
                  Reloj del Sistema en Vivo
                </span>
              </div>
              <span className="text-[11px] text-amber-300/80 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-900/60">
                Costa Rica (CST)
              </span>
            </div>

            {/* Big Hours / Minutes / Seconds */}
            <div className="text-4xl sm:text-5xl font-mono font-black text-amber-100 tracking-tight text-center py-2 flex items-center justify-center gap-1">
              <span>{timeString}</span>
            </div>

            {/* Localized Date */}
            <div className="text-center capitalize text-amber-200/90 text-sm font-medium">
              {dateString}
            </div>

            {/* Versión Instalada (con nombre idéntico a la Fecha y Hora de Instalación) */}
            <div 
              id="installed-version-badge"
              className="pt-2.5 mt-2 border-t border-stone-800/90 flex flex-col items-center justify-center gap-1.5"
            >
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-950/70 border border-amber-800/70 shadow-inner">
                <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-stone-300 text-[11px] font-semibold">Versión Instalada:</span>
                <span className="font-mono text-amber-300 font-bold text-xs tracking-wider">
                  {installedVersionName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
                <Calendar className="w-3 h-3 text-amber-500/80 shrink-0" />
                <span>Instalado: <strong className="text-stone-300 font-medium">{installedDateTimeFormatted}</strong></span>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: User Role Selector & Touch PIN Pad */}
        <div className={`lg:col-span-6 bg-stone-900/95 backdrop-blur-md border border-stone-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 ${isShaking ? 'animate-shake' : ''}`}>
          
          <div className="text-center space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <Lock className="w-3.5 h-3.5" />
              <span>Desbloqueo de Terminal</span>
            </div>
            <h2 className="text-lg font-black text-white">Seleccione su Perfil de Acceso</h2>
          </div>

          {/* User Selector: List of Registered Users */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-stone-400 flex items-center justify-between">
              <span>Cajero / Usuario Seleccionado:</span>
              <span className="text-amber-400 text-[10px]">O digite su PIN directamente</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {usersList.filter(u => u.active !== false).map(user => {
                const isSelected = selectedUser?.id === user.id;
                const isAdmin = user.role === 'ADMINISTRADOR';

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(user);
                      setPin('');
                      setError('');
                    }}
                    className={`p-2.5 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-amber-600 border-amber-400 text-white shadow-md ring-2 ring-amber-400/40'
                        : 'bg-stone-800/80 border-stone-700 text-stone-300 hover:bg-stone-800 hover:border-stone-600'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-amber-800 text-white' : 'bg-stone-700 text-amber-300'
                    }`}>
                      {isAdmin ? <Shield className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-xs truncate">{user.name}</div>
                      <div className={`text-[10px] truncate ${isSelected ? 'text-amber-100' : 'text-stone-400'}`}>
                        {isAdmin ? 'Administrador' : 'Cajero'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Success Message Banner */}
          {successMsg && (
            <div className="flex items-center gap-2 text-emerald-300 bg-emerald-950/60 border border-emerald-700 px-3 py-2 rounded-xl text-xs font-bold animate-pulse">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* PIN Input Display */}
          <div className="bg-stone-950/80 border border-stone-800 rounded-2xl p-3 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-amber-400 ml-1 shrink-0" />
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map((index) => {
                  const hasDigit = pin.length > index;
                  return (
                    <span
                      key={index}
                      className={`w-4 h-4 rounded-full border transition-all ${
                        hasDigit
                          ? 'bg-amber-400 border-amber-300 scale-110 shadow-sm'
                          : 'border-stone-700 bg-stone-900'
                      }`}
                    >
                      {showPin && hasDigit ? (
                        <span className="flex items-center justify-center text-[10px] font-black text-stone-950 h-full">
                          {pin[index]}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
                title={showPin ? "Ocultar PIN" : "Mostrar PIN"}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={pin.length === 0}
                className="text-xs font-semibold px-2 py-1 rounded text-stone-400 hover:text-rose-400 disabled:opacity-30 transition-colors"
              >
                Limpiar
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-rose-400 bg-rose-950/50 border border-rose-800/80 px-3 py-2 rounded-xl text-xs font-semibold animate-pulse">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Touch Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                id={`login-key-${digit}`}
                onClick={() => handleDigit(digit)}
                className="h-12 sm:h-13 rounded-2xl bg-stone-800/90 hover:bg-stone-700 active:bg-amber-600 active:text-white border border-stone-700/80 text-white font-bold text-xl transition-all shadow-xs flex items-center justify-center"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              id="login-key-clear"
              onClick={handleClear}
              className="h-12 sm:h-13 rounded-2xl bg-stone-800/50 hover:bg-rose-950/60 border border-stone-700 text-stone-300 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center"
            >
              C
            </button>

            <button
              type="button"
              id="login-key-0"
              onClick={() => handleDigit('0')}
              className="h-12 sm:h-13 rounded-2xl bg-stone-800/90 hover:bg-stone-700 active:bg-amber-600 active:text-white border border-stone-700/80 text-white font-bold text-xl transition-all shadow-xs flex items-center justify-center"
            >
              0
            </button>

            <button
              type="button"
              id="login-key-backspace"
              onClick={handleBackspace}
              className="h-12 sm:h-13 rounded-2xl bg-stone-800/50 hover:bg-stone-700 active:bg-amber-600 border border-stone-700 text-stone-300 transition-all flex items-center justify-center"
              title="Borrar dígito"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Unlock Submit Button */}
          <button
            type="button"
            id="login-submit-btn"
            onClick={handleSubmit}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:scale-[0.99] text-white font-black text-sm uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            <span>Ingresar {selectedUser ? `como ${selectedUser.name}` : 'al Sistema'}</span>
          </button>
        </div>

      </div>

      {/* Footer Legal & Security */}
      <div className="max-w-5xl w-full mx-auto text-center text-[11px] text-stone-500 py-2 border-t border-stone-900 flex flex-wrap items-center justify-between gap-2">
        <span>Pollo Frito Sabor Cervanteño • POS {installedVersionName}</span>
        <span>Acceso restringido por PIN • Facturación Electrónica DGT Costa Rica</span>
      </div>

    </div>
  );
};
