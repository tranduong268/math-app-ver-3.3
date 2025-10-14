import React from 'react';
import { useAudio } from '../contexts/AudioContext';
import { theme } from '../config/theme';

interface StartScreenProps {
  onStart: () => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onStart }) => {
  const { playSound } = useAudio();

  const handleStart = () => {
    playSound('DECISION'); // Play a sound on click, it will be queued until audio is unlocked
    onStart();
  };

  return (
    <div className={`w-full h-screen flex flex-col items-center justify-center p-4 text-center ${theme.colors.bg.body}`}>
      <div className={`p-8 md:p-12 rounded-2xl shadow-2xl ${theme.colors.bg.gameScreen} max-w-2xl w-full`}>
        <h1 className={`${theme.fontSizes.headerTitle} ${theme.colors.text.headerBrand} font-bold tracking-tight text-sky-600`}>
          TOÁN HỌC THÔNG MINH 🧠
        </h1>
        <p className={`mt-2 ${theme.fontSizes.headerSubtitle} ${theme.colors.text.secondary}`}>
          🌟 Chào mừng bé đến với trò chơi! 🌟
        </p>

        <p className="mt-8 text-lg md:text-xl text-gray-700">
          Nhấn nút bên dưới để bắt đầu cuộc phiêu lưu toán học kỳ thú nhé!
        </p>

        <button
          onClick={handleStart}
          className="mt-8 bg-pink-500 hover:bg-pink-600 text-white font-bold py-4 px-10 rounded-xl shadow-lg transition-transform transform hover:scale-110 animate-bounce text-2xl"
          style={{ animationDuration: '1.5s' }}
          aria-label="Bắt đầu trò chơi và bật âm thanh"
        >
          Bắt đầu!
        </button>
      </div>
       <footer className={`text-center text-sm ${theme.colors.text.light} mt-8 py-4`}>
        Toán Học Thông Minh - Phát triển bởi AI cho bé yêu học giỏi!
      </footer>
    </div>
  );
};

export default StartScreen;
