/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Pretendard",
          "system-ui",
          "-apple-system",
          "'Apple SD Gothic Neo'",
          "'Malgun Gothic'",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
