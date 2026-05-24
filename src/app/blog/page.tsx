"use client";

import { useState } from "react";

type BlogPost = {
  id: string;
  title: string;
  date: string;
  preview: string;
  content: string;
};

const BLOG_POSTS: BlogPost[] = [
  {
    id: "harvard-wpc",
    title: "What I Learned at the Harvard WPC",
    date: "March 2026",
    preview: "One of the biggest lessons I took from the Harvard WPC is that storytelling is a form of leadership. The physicians who made the deepest impact weren't just experts, they were storytellers. That validated the entire foundation of APMED.",
    content: "One of the biggest lessons I took from the Harvard WPC is that storytelling is a form of leadership. The physicians who made the deepest impact weren't just experts, they were storytellers. That validated the entire foundation of APMED.\n\nWhat struck me most was how many founders and leaders were using narrative as a tool for change. In medicine, we often think of impact as clinical outcomes or research publications, but I realized that influence—real, lasting influence—comes from being able to tell your story in a way that resonates.\n\nThis experience reinforced why AP MED exists. We're not just creating a directory; we're amplifying stories. We're creating a space where underrepresented voices in medicine don't just exist—they lead conversations.",
  },
  {
    id: "lmsa-ne",
    title: "What I Learned at the LMSA-NE Conference",
    date: "March 2026",
    preview: "Reflections from presenting research, connecting with leaders, and seeing firsthand how community-driven medicine shapes the next generation.",
    content: "Reflections from presenting research, connecting with leaders, and seeing firsthand how community-driven medicine shapes the next generation.\n\nThe LMSA-NE conference was a reminder that organizing is at the heart of progress in medicine. What impressed me most wasn't just the caliber of people in the room, but their commitment to lifting others up.\n\nI left with three key takeaways: First, community care is scalable. Second, representation in leadership isn't optional—it's essential. Third, the future of medicine will be built by people who refuse to succeed alone.",
  },
  {
    id: "directory-intro",
    title: "Introducing the AP MED Mentorship Directory",
    date: "February 2026",
    preview: "A look at how the directory started, why it matters, and how it's becoming a national resource for students seeking guidance in medicine.",
    content: "A look at how the directory started, why it matters, and how it's becoming a national resource for students seeking guidance in medicine.\n\nThe mentorship directory wasn't born from a business plan. It came from conversations. From students who said, 'I don't know who to talk to.' From mentors who said, 'I want to help, but how do I find the right mentee?'\n\nWhat started as a simple spreadsheet has grown into a resource connecting hundreds of students with mentors who genuinely understand their journey. Not because they're the most famous doctors—but because they were the first-gen students, the underrepresented voices, the ones who remember what it felt like to not see themselves in medicine.",
  },
  {
    id: "first-gen-founder",
    title: "Building AP MED as a First-Gen Founder",
    date: "January 2026",
    preview: "Behind the scenes of building a platform while navigating the premed journey — the challenges, the wins, and the lessons shaping AP MED.",
    content: "Behind the scenes of building a platform while navigating the premed journey — the challenges, the wins, and the lessons shaping AP MED.\n\nThere's a unique challenge in building something while you're still inside the system you're trying to change. As a premed student, I'm navigating the same pressures my users are facing. The MCAT studying, the stress about interviews, the constant question of 'am I doing enough?'\n\nBut I think that's also AP MED's greatest strength. I'm not building this from the outside looking in. I'm in it. And that means I never lose sight of what actually matters to students—not theoretically, but practically.",
  },
  {
    id: "why-started",
    title: "Why I Started AP MED",
    date: "January 2026",
    preview: "A founder note on identity, representation, and the moment I realized storytelling could become a mentorship platform for underrepresented premeds.",
    content: "A founder note on identity, representation, and the moment I realized storytelling could become a mentorship platform for underrepresented premeds.\n\nI started AP MED because I saw a gap. But more than that—I lived in that gap.\n\nAs a first-generation student, I didn't have the family network that many of my peers did. No parents who were doctors. No aunts and uncles to call with questions. But I had something else: stories. I had podcasts, YouTube videos, and conversations with mentors who took time to share their paths.\n\nI realized that what I was doing informally—connecting stories with students who needed them—could be systematized. Could be scaled. Could become a resource that makes sure no first-gen student, no student of color, no international student ever feels alone in medicine.",
  },
  {
    id: "platform-guide",
    title: "What AP MED Is & How to Use This Platform",
    date: "January 2026",
    preview: "A quick guide to AP MED — what we do, who we serve, and how students can use the directory, episodes, and resources to navigate their premed journey.",
    content: "A quick guide to AP MED — what we do, who we serve, and how students can use the directory, episodes, and resources to navigate their premed journey.\n\nAP MED is a mentorship and storytelling platform for pre-med students, especially those from underrepresented backgrounds.\n\nHere's how to use it:\n\n1. Browse the Directory: Find mentors at every stage of the medical journey—from first-gen undergrads to attending physicians. Filter by specialty, background, and what they can help with.\n\n2. Listen to Episodes: Our podcast features real conversations with healthcare professionals about their paths, their struggles, and their wins.\n\n3. Connect: Reach out to mentors whose stories resonate with you. Most are open to conversations.\n\n4. Share Your Story: If you're a healthcare professional, consider joining our mentor directory. Your story could be exactly what someone needs to hear.",
  },
];

export default function Blog() {
  const [selectedPost, setSelectedPost] = useState<string | null>(null);

  const post = selectedPost ? BLOG_POSTS.find((p) => p.id === selectedPost) : null;

  if (post) {
    return (
      <section className="mt-16">
        <button
          onClick={() => setSelectedPost(null)}
          className="text-sm text-neutral-400 hover:text-white transition-colors mb-6"
        >
          ← Back to posts
        </button>
        <article className="max-w-2xl">
          <h1 className="text-3xl font-bold text-white mb-2">{post.title}</h1>
          <time className="text-sm text-neutral-500 block mb-6">{post.date}</time>
          <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">{post.content}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="mt-16">
      <h2 className="text-2xl font-bold mb-6 text-white">blog</h2>
      <div className="space-y-4">
        {BLOG_POSTS.map((post) => (
          <button
            key={post.id}
            onClick={() => setSelectedPost(post.id)}
            className="w-full text-left flex flex-col gap-2 pb-4 px-4 py-3 rounded-lg border border-gray-700 hover:border-[var(--global-theme-color)] hover:bg-gray-800 transition-all"
          >
            <h3 className="text-lg font-semibold text-white">{post.title}</h3>
            <time className="text-xs text-neutral-500">{post.date}</time>
            <p className="text-sm text-neutral-400 line-clamp-2">{post.preview}</p>
            <span className="text-xs text-neutral-500 mt-1">Read more →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
