import React from 'react';

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#09090B] pt-24 pb-12 px-6 w-full mt-20 relative z-10">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
        
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-outfit font-bold text-[#09090B]">
              C
            </div>
            <span className="text-2xl font-outfit font-semibold tracking-tight text-white">Crayon</span>
          </div>
          <p className="text-white/50 font-inter leading-relaxed max-w-sm mb-8 tracking-wide">
            The autonomous software engineer that understands your entire codebase, plans tasks, and executes safely.
          </p>
          <div className="flex items-center gap-4">
            {/* Social Icons mock */}
            <a href="#" className="w-10 h-10 rounded-full bg-[#121214] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50 hover:text-white focus-ring" aria-label="Twitter">𝕏</a>
            <a href="#" className="w-10 h-10 rounded-full bg-[#121214] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50 hover:text-white focus-ring" aria-label="GitHub">GH</a>
            <a href="#" className="w-10 h-10 rounded-full bg-[#121214] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50 hover:text-white focus-ring" aria-label="LinkedIn">IN</a>
          </div>
        </div>

        <div>
          <h4 className="text-white font-outfit font-medium mb-6 uppercase tracking-wider text-sm">Product</h4>
          <ul className="space-y-4 text-white/50 font-inter text-sm">
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Features</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Pricing</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Changelog</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Integrations</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-outfit font-medium mb-6 uppercase tracking-wider text-sm">Resources</h4>
          <ul className="space-y-4 text-white/50 font-inter text-sm">
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Documentation</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">API Reference</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Blog</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Community</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-outfit font-medium mb-6 uppercase tracking-wider text-sm">Legal</h4>
          <ul className="space-y-4 text-white/50 font-inter text-sm">
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Privacy Policy</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Terms of Service</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Cookie Policy</a></li>
            <li><a href="#" className="hover:text-white transition-colors focus-ring rounded-sm">Security</a></li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-white/40 text-sm font-inter">© {new Date().getFullYear()} Forge Protocol Inc. All rights reserved.</p>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00FF66] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00FF66]"></span>
          </span>
          <span className="text-white/40 text-sm font-inter">All systems operational</span>
        </div>
      </div>
    </footer>
  );
}
