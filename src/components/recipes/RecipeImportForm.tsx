/**
 * RecipeImportForm Component
 *
 * URL input for recipe import with preview and fallback to AI extraction.
 *
 * Recipe import from URL.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { recipesApi, type ImportPreviewResponse, type ExtractedRecipe } from '@/api/client';

interface RecipeImportFormProps {
  onPreviewReady: (recipe: ExtractedRecipe) => void;
  onCancel: () => void;
}

export function RecipeImportForm({ onPreviewReady, onCancel }: RecipeImportFormProps) {
  const [url, setUrl] = useState('');
  const [showAiFallback, setShowAiFallback] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiJsonInput, setAiJsonInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const previewMutation = useMutation({
    mutationFn: (url: string) => recipesApi.importPreview(url),
    onSuccess: (response: ImportPreviewResponse) => {
      if (response.success && response.recipe) {
        onPreviewReady(response.recipe);
      } else {
        setErrorMessage(response.error_message || 'Failed to extract recipe');
        if (response.ai_prompt) {
          setAiPrompt(response.ai_prompt);
          setShowAiFallback(true);
        }
      }
    },
    onError: (error: Error) => {
      setErrorMessage(error.message || 'Failed to fetch recipe');
    },
  });

  const aiParseMutation = useMutation({
    mutationFn: () => recipesApi.importAiParse(aiJsonInput, url),
    onSuccess: (response: ImportPreviewResponse) => {
      if (response.success && response.recipe) {
        onPreviewReady(response.recipe);
      } else {
        setErrorMessage(response.error_message || 'Failed to parse AI response');
      }
    },
    onError: (error: Error) => {
      setErrorMessage(error.message || 'Failed to parse AI response');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setShowAiFallback(false);
    if (url.trim()) {
      previewMutation.mutate(url.trim());
    }
  };

  const handleAiParse = () => {
    if (aiJsonInput.trim()) {
      aiParseMutation.mutate();
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(aiPrompt);
  };

  return (
    <div className="space-y-6">
      {/* URL Input */}
      <form onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Recipe URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.allrecipes.com/recipe/..."
            className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
            disabled={previewMutation.isPending}
          />
          <button
            type="submit"
            disabled={!url.trim() || previewMutation.isPending}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {previewMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Importing...
              </span>
            ) : (
              'Import'
            )}
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Supports AllRecipes, Food Network, BBC Good Food, and 100+ recipe sites
        </p>
      </form>

      {/* Error Message */}
      {errorMessage && !showAiFallback && (
        <div className="p-4 bg-amber-900/30 border border-amber-800 rounded-lg text-amber-200">
          {errorMessage}
        </div>
      )}

      {/* AI Fallback */}
      {showAiFallback && (
        <div className="space-y-4 p-4 bg-amber-900/20 border border-amber-800/50 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h3 className="font-medium text-amber-200">Manual Extraction Required</h3>
              <p className="text-sm text-amber-100/80 mt-1">
                This site isn't supported for automatic extraction. Use AI to help extract the recipe.
              </p>
            </div>
          </div>

          {/* AI Prompt Section */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Step 1: Copy this prompt to an AI assistant (ChatGPT, Claude, etc.)
            </label>
            <div className="relative">
              <textarea
                readOnly
                value={aiPrompt}
                className="w-full h-40 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 font-mono resize-none"
              />
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          {/* JSON Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Step 2: Paste the AI's JSON response here
            </label>
            <textarea
              value={aiJsonInput}
              onChange={(e) => setAiJsonInput(e.target.value)}
              placeholder='Paste the JSON from the AI here...'
              className="w-full h-40 px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 font-mono text-sm resize-none focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            onClick={handleAiParse}
            disabled={!aiJsonInput.trim() || aiParseMutation.isPending}
            className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {aiParseMutation.isPending ? 'Parsing...' : 'Import from Paste'}
          </button>
        </div>
      )}

      {/* Cancel Button */}
      <div className="flex justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
