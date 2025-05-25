# 🤖 Vibescoded Claude Chat App

A beautiful, real-time chat interface built with **Bun**, **React**, and **Tailwind CSS** that lets you have conversations with Claude (Anthropic's AI assistant).

## ✨ Features

- 💬 **Real-time Chat**: Seamless conversation flow with Claude
- 💾 **Persistent History**: Chat history saved to localStorage across sessions
- ⚡ **Fast & Responsive**: Built with Bun for lightning-fast performance
- 🎨 **Beautiful UI**: Clean, modern design with Tailwind CSS
- ⌨️ **Keyboard Shortcuts**: Send messages with `Cmd+Enter` (or `Ctrl+Enter`)
- 🔄 **Auto-scroll**: Automatically follows the conversation
- 🗑️ **Reset Chat**: Clear conversation history with confirmation
- 🤔 **Loading States**: Visual feedback when Claude is thinking
- 📱 **Responsive Design**: Works great on all screen sizes

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime installed
- Anthropic API key

### Installation

1. **Clone and install dependencies:**

   ```bash
   git clone <your-repo>
   cd anthropic-play
   bun install
   ```

2. **Set up your Anthropic API key:**

   ```bash
   export ANTHROPIC_KEY=your_api_key_here
   ```

3. **Start the development server:**

   ```bash
   bun dev
   ```

4. **Open your browser and start chatting!** 🎉
   Navigate to `http://localhost:3000`

## 🛠️ For Production

```bash
bun start
```

## 🏗️ Tech Stack

- **⚡ Bun** - Fast all-in-one JavaScript runtime
- **⚛️ React** - UI framework with hooks and state management
- **🎨 Tailwind CSS** - Utility-first CSS framework
- **🤖 Claude API** - Anthropic's powerful AI assistant
- **💾 LocalStorage** - Client-side persistence

## 🔧 Project Structure

- `src/index.tsx` - Bun server with API routes
- `src/APITester.tsx` - Main chat component
- `src/App.tsx` - React app wrapper
- `src/index.css` - Tailwind styles and animations

## 🎯 Usage

1. Type your message in the input box at the bottom
2. Press `Enter` or click "Send" to send your message
3. Use `Cmd+Enter` (Mac) or `Ctrl+Enter` (Windows/Linux) for quick sending
4. Your conversation history is automatically saved
5. Use "Reset Chat" to start a new conversation

## 🤖 About This Project

This project was almost entirely **Vibescoded** with [Claude](https://claude.ai) - Anthropic's AI assistant! 🎉

From the initial concept to the final implementation, Claude helped with:

- 🏗️ **Architecture decisions** - Choosing the right tech stack and project structure
- 💻 **Code implementation** - Writing React components, API endpoints, and styling
- 🎨 **UI/UX design** - Creating the chat interface and user experience
- 🐛 **Debugging** - Fixing issues and optimizing performance
- 📝 **Documentation** - Writing this very README!

It's a testament to the power of AI-assisted development - what would normally take 30 mins was completed in about 20 minutes of collaborative coding between human and AI. The future of programming is here! 🚀

---

Built with ❤️ using Bun v1.2.14+ and Claude's coding superpowers ⚡
