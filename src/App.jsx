import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  BookOpen, 
  MessageCircle, 
  Languages, 
  Loader2, 
  Search, 
  Volume2,
  Save,
  Sparkles,
  BookText,
  X,
  HelpCircle
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';

// --- 1. FIREBASE CONFIGURATION ---
// (I copied the structure from your screenshot, but you must paste the values back in!)
const firebaseConfig = {
  apiKey: "PASTE_YOUR_FIREBASE_API_KEY_HERE",
  authDomain: "my-way-to-french-c2.firebaseapp.com",
  projectId: "my-way-to-french-c2",
  storageBucket: "my-way-to-french-c2.firebasestorage.app",
  messagingSenderId: "26662411136",
  appId: "1:26662411136:web:f7956b819034a01e12bf65"
};

// --- 2. GEMINI API KEY ---
const apiKey = "AIzaSyBz642GWXDZAakN6adVkW0timspyr-LCAc"; 

// --- 3. INITIALIZATION (Do not change this) ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function FrenchJournal() {
  const [user, setUser] = useState(null);
  const [phrases, setPhrases] = useState([]);
  const [newPhrase, setNewPhrase] = useState('');
  
  // Loading States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStoryLoading, setIsStoryLoading] = useState(false);
  const [loadingGrammarId, setLoadingGrammarId] = useState(null);

  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Feature States
  const [story, setStory] = useState(null); 
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [grammarExplanations, setGrammarExplanations] = useState({});

  // 1. Authentication Setup (Simplified for Local Use)
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
        setError("Failed to authenticate. Please refresh.");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Data Synchronization (Firestore)
  useEffect(() => {
    if (!user) return;
    // SIMPLIFIED PATH for local app:
    const collectionRef = collection(db, 'users', user.uid, 'phrases');
    
    const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
      const loadedPhrases = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      loadedPhrases.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });
      setPhrases(loadedPhrases);
    }, (err) => {
      console.error("Firestore error:", err);
      setError("Failed to load your phrases.");
    });
    return () => unsubscribe();
  }, [user]);

  // --- API Helper ---
  const callGemini = async (prompt) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    );
    if (!response.ok) throw new Error('AI service unavailable');
    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error('No result from AI');
    return JSON.parse(resultText);
  };

  // --- Feature 1: Enrich Phrase ---
  const enrichPhrase = async (text) => {
    const prompt = `
      I am learning French. Target phrase: "${text}"
      Provide:
      1. Translation
      2. French example sentence
      3. English translation of example
      Return JSON: { "translation": "...", "example_french": "...", "example_english": "..." }
    `;
    return callGemini(prompt);
  };

  // --- Feature 2: Story Mode ---
  const generateStory = async () => {
    if (phrases.length === 0) return;
    setIsStoryLoading(true);
    setError('');
    
    const recentPhrases = phrases.slice(0, 10).map(p => p.original).join(", ");

    const prompt = `
      Write a short, simple French story (max 100 words) that naturally incorporates as many of these phrases as possible: [${recentPhrases}].
      If a phrase doesn't fit naturally, you can skip it.
      
      Return JSON:
      {
        "title": "A creative title in French",
        "story_french": "The full story in French",
        "story_english": "The full story translated to English"
      }
    `;

    try {
      const data = await callGemini(prompt);
      setStory(data);
      setShowStoryModal(true);
    } catch (err) {
      setError("Could not generate story. Try again.");
    } finally {
      setIsStoryLoading(false);
    }
  };

  // --- Feature 3: Grammar Guide ---
  const explainGrammar = async (phraseId, text) => {
    if (grammarExplanations[phraseId]) return;
    
    setLoadingGrammarId(phraseId);
    
    const prompt = `
      Explain the grammar of this French phrase briefly for a beginner: "${text}".
      Mention things like verb tense, gender/number agreement, or key prepositions.
      Keep it under 40 words.
      
      Return JSON: { "explanation": "..." }
    `;

    try {
      const data = await callGemini(prompt);
      setGrammarExplanations(prev => ({
        ...prev,
        [phraseId]: data.explanation
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGrammarId(null);
    }
  };

  // --- Handlers ---
  const handleAddPhrase = async (e) => {
    e.preventDefault();
    if (!newPhrase.trim() || !user) return;
    setIsGenerating(true);
    setError('');
    try {
      const enrichedData = await enrichPhrase(newPhrase);
      // SIMPLIFIED PATH for local app:
      await addDoc(collection(db, 'users', user.uid, 'phrases'), {
        original: newPhrase,
        translation: enrichedData.translation,
        exampleFrench: enrichedData.example_french,
        exampleEnglish: enrichedData.example_english,
        createdAt: serverTimestamp(),
      });
      setNewPhrase('');
    } catch (err) {
      console.error(err);
      setError("Could not translate/save. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    try {
      // SIMPLIFIED PATH for local app:
      await deleteDoc(doc(db, 'users', user.uid, 'phrases', id));
    } catch (err) { console.error(err); }
  };

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    window.speechSynthesis.speak(utterance);
  };

  const filteredPhrases = phrases.filter(p => 
    p.original?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.translation?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      
      {/* Header */}
      <header className="bg-indigo-600 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Mon Journal</h1>
              <p className="text-indigo-200 text-xs">French Learning Companion</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             {phrases.length > 2 && (
              <button
                onClick={generateStory}
                disabled={isStoryLoading}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-xs font-medium text-white rounded-full transition-colors disabled:opacity-50"
              >
                {isStoryLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-yellow-300" />}
                ✨ Story Mode
              </button>
            )}
            <div className="text-xs bg-indigo-800/50 px-3 py-1 rounded-full text-indigo-100">
              {phrases.length} Saved
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        
        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 transform transition-all">
          <label className="block text-sm font-medium text-slate-500 mb-2">
            Add a new phrase to your collection
          </label>
          <form onSubmit={handleAddPhrase} className="relative">
            <input
              type="text"
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
              placeholder="e.g., C'est la vie, Je voudrais un café..."
              className="w-full pl-4 pr-14 py-4 text-lg rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all placeholder:text-slate-300"
              disabled={isGenerating}
            />
            <button
              type="submit"
              disabled={isGenerating || !newPhrase.trim()}
              className="absolute right-2 top-2 bottom-2 bg-indigo-600 text-white px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
            </button>
          </form>
          {error && (
            <div className="mt-3 text-red-500 text-sm flex items-center gap-2 animate-fadeIn">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              {error}
            </div>
          )}
          <div className="mt-3 flex items-start gap-2 text-xs text-slate-400">
             <Languages className="w-4 h-4 mt-0.5 shrink-0" />
             <p>AI automatically translates and creates usage examples.</p>
          </div>
        </div>

        {/* Search & List */}
        <div className="flex flex-col gap-6">
          
          {phrases.length > 0 && (
            <div className="flex justify-between items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search phrases..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-sm transition-colors"
                />
              </div>
              {/* Mobile Story Button */}
               {phrases.length > 2 && (
                <button
                  onClick={generateStory}
                  disabled={isStoryLoading}
                  className="sm:hidden flex items-center gap-2 px-3 py-2 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg"
                >
                  {isStoryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Story Mode
                </button>
              )}
            </div>
          )}

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPhrases.map((phrase) => (
              <div 
                key={phrase.id} 
                className="group bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col relative overflow-hidden"
              >
                {/* Decorative bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500/0 group-hover:bg-indigo-500 transition-colors"></div>

                {/* Header */}
                <div className="flex justify-between items-start mb-3 pl-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-slate-800 font-serif">
                        {phrase.original}
                      </h3>
                      <button 
                        onClick={() => speak(phrase.original)}
                        className="p-1.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Listen"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-indigo-600 font-medium text-sm">{phrase.translation}</p>
                  </div>
                  <button 
                    onClick={() => handleDelete(phrase.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete phrase"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Grammar & Example Section */}
                <div className="mt-auto pl-2 pt-3 border-t border-slate-100">
                  
                  {/* Grammar Toggle */}
                  <div className="mb-3">
                    <button 
                      onClick={() => explainGrammar(phrase.id, phrase.original)}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
                      disabled={loadingGrammarId === phrase.id}
                    >
                      {loadingGrammarId === phrase.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <HelpCircle className="w-3 h-3" />
                      )}
                      <span className="font-medium">
                        {grammarExplanations[phrase.id] ? "Grammar Note:" : "✨ Explain Grammar"}
                      </span>
                    </button>
                    
                    {/* Grammar Result */}
                    {grammarExplanations[phrase.id] && (
                      <div className="mt-2 text-xs text-indigo-800 bg-indigo-50 p-2 rounded-md border border-indigo-100 animate-fadeIn">
                        {grammarExplanations[phrase.id]}
                      </div>
                    )}
                  </div>

                  {/* Example */}
                  <div className="flex items-start gap-2">
                    <MessageCircle className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                    <div>
                      <p className="text-slate-700 italic text-sm">"{phrase.exampleFrench}"</p>
                      <p className="text-slate-400 text-xs mt-0.5">{phrase.exampleEnglish}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Empty State */}
          {!isGenerating && phrases.length === 0 && (
            <div className="text-center py-16 px-4">
              <div className="bg-white inline-flex p-4 rounded-full shadow-sm mb-4">
                <Save className="w-8 h-8 text-indigo-300" />
              </div>
              <h3 className="text-slate-900 font-medium text-lg mb-2">No phrases yet</h3>
              <p className="text-slate-500 max-w-sm mx-auto">
                Start typing French words or sentences above. We'll handle the translation and examples for you.
              </p>
            </div>
          )}
        </div>

        {/* Story Modal */}
        {showStoryModal && story && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto flex flex-col">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                    <BookText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{story.title}</h2>
                    <p className="text-xs text-slate-500">Generated using your vocabulary</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowStoryModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-indigo-600 mb-2 uppercase tracking-wide">French Story</h3>
                  <p className="text-slate-800 leading-relaxed font-serif text-lg">
                    {story.story_french}
                  </p>
                  <button 
                    onClick={() => speak(story.story_french)}
                    className="mt-3 text-xs flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition-colors"
                  >
                    <Volume2 className="w-4 h-4" /> Listen to story
                  </button>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h3 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">English Translation</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {story.story_english}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}