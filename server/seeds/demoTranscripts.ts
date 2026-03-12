/**
 * Pre-built transcript templates for the demo tenant.
 * Each call type has multiple templates with name/address placeholders.
 * Provides variety so demo data looks realistic over time.
 */

type TranscriptBuilder = (name: string, address: string) => string;

const coldCallTemplates: TranscriptBuilder[] = [
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Hey, good morning! This is Marcus with Apex Property Solutions. Am I speaking with ${first}?

${first}: Yeah, that's me. What's this about?

Rep: Great, thanks for picking up. I was reaching out because I noticed you own the property at ${address}. We're a local investment company and we help homeowners in your area who might be interested in selling their property quickly, without the hassle of listing with an agent. I was curious — have you ever thought about selling?

${first}: I mean, I've thought about it a little bit. The house needs a lot of work and I just don't have the money to fix it up right now. But I'm not sure I want to sell either.

Rep: That totally makes sense. A lot of the people we work with are in similar situations — they've got a property that needs repairs but it doesn't make sense to dump money into it. Can I ask, how long have you owned the place?

${first}: About 12 years now. Bought it when things were cheaper. The roof needs replacing, the kitchen is outdated, and the basement had some water damage last year.

Rep: Wow, okay. That's a lot to deal with. And are you currently living there or is it a rental?

${first}: I'm living here, but I've been thinking about moving closer to my daughter. She's in Memphis and I'm getting older, you know.

Rep: I completely understand. Family is important. So if we could make you a fair cash offer and close on your timeline — whether that's two weeks or two months — would that be something worth exploring?

${first}: I guess it wouldn't hurt to hear what you'd offer. But I'm not going to give it away.

Rep: Absolutely, and I wouldn't expect you to. What I'd like to do is get a few more details about the property, maybe schedule a quick walkthrough, and then I can put together a real number for you. No pressure, no obligation. Would that work?

${first}: Let me think about it. Can you call me back next week?

Rep: Of course! I'll give you a call next Tuesday around this same time. Sound good?

${first}: Yeah, that works. Talk to you then.

Rep: Perfect. Thanks for your time, ${first}. Have a great day!`;
  },
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Hi there, is this ${first}? This is Jake calling from Apex Property Solutions.

${first}: Yeah, who is this again?

Rep: Jake Morrison, Apex Property Solutions. I'm calling because we work with homeowners in your area and I noticed you own the property at ${address}. We buy houses directly — no agents, no fees, close fast. Is that something you'd ever consider?

${first}: I'm not really looking to sell right now.

Rep: Totally understand. Most people I talk to aren't actively looking. I'm just wondering — if the right offer came along, is it something you'd be open to? Even just hearing a number?

${first}: I mean, maybe. What kind of numbers are we talking about?

Rep: That depends on the property. Can I ask a few quick questions? It'll take two minutes tops. What's the current condition like?

${first}: It's okay. Needs some updating — the bathrooms are from the 90s, carpet's worn. Nothing major wrong though.

Rep: Got it. And is anyone living there currently?

${first}: Yeah, I live here with my wife. We've been here about 8 years.

Rep: And what would make you consider selling? Is there a situation where it would make sense?

${first}: Honestly, we've been talking about downsizing. Kids are gone, we don't need all this space. But we're not in a rush.

Rep: That makes total sense. A lot of folks I work with are in the same boat. Here's what I can do — I can pull some comparable sales in your neighborhood and give you a ballpark. No commitment, just information. Would that be helpful?

${first}: Sure, I guess that can't hurt.

Rep: Great! I'll do some research and call you back in a couple days with some numbers. Sound good?

${first}: Yeah, that's fine. Thanks.

Rep: Perfect, talk to you soon ${first}!`;
  },
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Good afternoon, am I speaking with ${first}?

${first}: Yes, who's calling?

Rep: This is Alyssa from Apex Property Solutions. I'm reaching out to homeowners in your area — specifically about the property at ${address}. We buy homes directly for cash and I wanted to see if selling might be on your radar.

${first}: Actually, your timing is pretty good. I've been thinking about it. My husband passed last year and I'm having trouble keeping up with the place.

Rep: I'm so sorry to hear about your husband, ${first}. That's a really tough situation. If you don't mind me asking, what's been the biggest challenge with the property?

${first}: Everything. The yard is too much, the gutters need cleaning, there's a leak in the back bedroom. I just can't do it all by myself anymore.

Rep: I completely understand. You shouldn't have to carry all that on your own. That's exactly the kind of situation where we can help. We handle everything — repairs, cleaning, all of it. You just pack your personal belongings.

${first}: That sounds nice. But I don't want to get lowballed. The house is worth something.

Rep: Absolutely, and I respect that. We always run full comparable analysis and our offers are fair. We're not looking to take advantage of anyone. Can I ask — do you have a timeline in mind? Is there somewhere you're looking to move?

${first}: My sister has a place in Florida. She's been asking me to come down for months.

Rep: That sounds wonderful. Would it help if I came by this week for a quick walkthrough? I can give you a much better estimate after seeing the place in person. No pressure, no obligation.

${first}: Let me think about it. Can you call me tomorrow?

Rep: Of course. I'll call you tomorrow afternoon. Thank you for sharing all that with me, ${first}. Talk soon.`;
  },
];

const followUpTemplates: TranscriptBuilder[] = [
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Hi ${first}, this is Sarah from Apex Property Solutions. We spoke last week about your property at ${address}. How are you doing today?

${first}: Oh right, yeah. I've been thinking about what we talked about.

Rep: Great! I'm glad you've had some time to think it over. Have your plans changed at all since we last chatted? Are you still considering moving closer to family?

${first}: Yeah, I talked to my daughter and she really wants me to come down there. So I'm more serious about it now than I was before.

Rep: That's wonderful. I think that's a smart move. So let me ask — when we spoke last time, you mentioned the property needs a new roof and has some water damage in the basement. Has anything else come up since then?

${first}: Actually, the HVAC started acting up too. It's making this terrible noise. I got a quote to fix it and they said $4,500. I just can't keep throwing money at this place.

Rep: That's frustrating, and I completely understand. The good news is, when we make an offer, we factor in all those repairs. You wouldn't need to fix a thing. We buy properties as-is.

${first}: Okay, so what kind of number are we talking about?

Rep: Well, I'd love to get out there and see the property in person so I can give you the most accurate offer possible. Based on what you've told me, I'm confident we can put together something fair. Are you free sometime this week for a quick 15-minute walkthrough?

${first}: How about Thursday afternoon?

Rep: Thursday afternoon works great. Let's say 2 PM? I'll come by, take a quick look, and we can talk numbers right there. No pressure at all.

${first}: Alright, let's do it.

Rep: Perfect! I'll see you Thursday at 2 PM at ${address}. Thanks, ${first}. Looking forward to it!`;
  },
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Hey ${first}, this is Marcus following up from Apex Property Solutions. We chatted about two weeks ago regarding ${address}. You mentioned you wanted some time to think things over. How's everything going?

${first}: Oh yeah, I remember. Things have been busy but I'm still thinking about it.

Rep: No rush at all. I just wanted to check in and see if anything's changed on your end. Last time you mentioned the property needed some work on the foundation?

${first}: Yeah, I actually got an estimate on that. They're saying $15,000 to $20,000 just for the foundation work. That's on top of everything else.

Rep: That's a big number. And that's exactly the kind of thing we factor into our offers — you wouldn't need to spend a dime on that. We take care of all repairs after closing. Have you gotten any closer to making a decision?

${first}: I'm leaning towards selling, honestly. My wife and I have been going back and forth but the repair costs are just piling up.

Rep: I hear you. What if I could get you a number this week? Would that help you make a decision?

${first}: Yeah, that would actually be helpful. At least then we'd know what we're working with.

Rep: Perfect. I can come by tomorrow or Friday for a quick 15-minute walkthrough. Which works better?

${first}: Friday morning would be good. Around 10?

Rep: Friday at 10 AM, perfect. I'll be there. Thanks ${first}, see you then!`;
  },
];

const offerCallTemplates: TranscriptBuilder[] = [
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Hi ${first}, thanks for taking my call. I'm following up on our walkthrough at ${address}. I've had a chance to run the numbers and I wanted to go through everything with you.

${first}: Okay, I've been waiting to hear from you.

Rep: So I really appreciate you showing me the property. After looking at comparable sales in your area, factoring in the condition of the property and the repairs needed — the roof, the basement water damage, the HVAC, and the kitchen — I'd like to make you an offer of $142,000, all cash, and we can close in as little as two weeks.

${first}: $142,000? I was hoping for more like $175,000. The Zillow estimate says it's worth $195,000.

Rep: I totally understand. Zillow estimates are based on properties that are in move-in ready condition. When you factor in the roof replacement — that's about $12,000 to $15,000 — the HVAC repair, the basement waterproofing, and a kitchen update, we're looking at roughly $40,000 to $50,000 in repairs. After those repairs, the property would sell for around $190,000, but by then you'd also be paying agent commissions, closing costs, and holding costs.

${first}: I see what you're saying, but $142,000 still feels low.

Rep: I hear you, and I want to make sure this feels right for you. Here's what we bring to the table that you wouldn't get listing with an agent: we close in two weeks, we pay all closing costs, you don't fix a thing, and there's zero risk of the deal falling through. No inspections, no financing contingencies. Just certainty.

${first}: And I wouldn't have to pay any agent fees?

Rep: Zero. No commissions, no closing costs on your end, no hidden fees. The $142,000 is what you walk away with.

${first}: Let me talk to my daughter about it this weekend. Can you give me until Monday?

Rep: Absolutely. I'll follow up with you Monday afternoon. Take your time, talk it over, and if you have any questions before then, you've got my number. Sound good?

${first}: Yeah, that sounds fair. I'll let you know Monday.

Rep: Perfect. Thanks, ${first}. Talk to you Monday!`;
  },
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: ${first}, great to connect again. I've completed my analysis on ${address} and I'm ready to walk you through our offer. Do you have a few minutes?

${first}: Yeah, go ahead.

Rep: So based on the walkthrough and the comparable sales in your neighborhood, here's where we landed. The after-repair value of the home — meaning what it would sell for fully updated — is approximately $210,000. The repairs we identified during the walkthrough total about $35,000 to $40,000. Taking that into account along with our costs, we'd like to offer you $128,000, all cash, with a two-week close.

${first}: $128,000? That seems really low for a 3-bedroom house.

Rep: I understand the reaction, and I want to be transparent about how we got there. The comparable sale at the end of your block went for $205,000, but that home had a brand new kitchen, updated bathrooms, and new flooring. Your property needs all of that work. When you add in the holding costs, closing costs, and the risk we take on, $128,000 is where we need to be.

${first}: What if I just listed it on the market?

Rep: That's definitely an option. If you listed at full market value, you'd need to invest in those repairs first — that's $35,000 to $40,000 out of pocket. Then you'd wait 60 to 90 days for a buyer, pay 6% in agent commissions, 2% in closing costs, and carry the mortgage the whole time. After all that, you'd net somewhere around $140,000 to $150,000. With us, you get $128,000 in your pocket in two weeks with zero hassle.

${first}: When you put it that way, the gap isn't as big as I thought.

Rep: Exactly. And there's no uncertainty with our offer. No inspections that could kill the deal, no financing that could fall through. Just a clean close.

${first}: I need to talk to my wife. Can I get back to you by Wednesday?

Rep: Absolutely. Take your time. I'll check in Wednesday evening if I haven't heard from you. Sound good?

${first}: Sounds good. Thanks for explaining everything.

Rep: My pleasure, ${first}. Talk to you Wednesday!`;
  },
];

const appointmentCallTemplates: TranscriptBuilder[] = [
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Hey ${first}, this is Derek from Apex Property Solutions. I'm calling to confirm our walkthrough appointment at ${address}. We had you down for Thursday at 2 PM — does that still work?

${first}: Yes, I've got it on my calendar. What exactly should I expect?

Rep: Great question. So when I come by, I'll take a quick walk through the property — usually takes about 15 to 20 minutes. I'll look at the overall condition, take some notes, and check out the areas you mentioned need work like the roof and the basement. After that, I'll go back and run some comparable sales in your area and put together a fair cash offer.

${first}: Are you going to bring a contractor or anything like that?

Rep: No, it'll just be me. I've been doing this for years, so I have a pretty good eye for estimating repairs. And anything I can't see, I'll factor in conservatively. We always account for the unexpected.

${first}: Okay. And how long until I get an offer after the walkthrough?

Rep: Usually within 24 to 48 hours. I want to make sure I do my homework and give you an accurate number. I never want to lowball anyone — that's not how we operate.

${first}: Good, because I had another investor come through a few months ago and their offer was insultingly low.

Rep: I'm sorry to hear that. We pride ourselves on being transparent and fair. I'll walk you through exactly how I arrive at the number, so there's no mystery. If it works for you, great. If not, no hard feelings.

${first}: That sounds reasonable. I'll see you Thursday then.

Rep: Perfect! Thursday at 2 PM. One last thing — will anyone else be at the property who's involved in the decision? Just want to make sure everyone has the information they need.

${first}: My wife will be here too. She wants to be part of the conversation.

Rep: Wonderful, that's even better. I'll make sure to address any questions she has as well. See you both Thursday!`;
  },
];

const dispoCallTemplates: TranscriptBuilder[] = [
  (name, address) => {
    return `Rep: Hey Nick, it's Tyler from Apex. I've got a deal I think is right in your wheelhouse. You got a minute?

Nick: Yeah, what do you have?

Rep: So we just locked up a property at ${address}. It's a 3-bed, 2-bath, about 1,400 square feet. Built in 1985. The ARV on this one is around $235,000 based on three recent comps within a half mile.

Nick: Okay, what kind of shape is it in?

Rep: It needs a full rehab — kitchen, bathrooms, flooring throughout, and the roof has about 3 years left on it. I'd estimate total rehab around $45,000 to $55,000 if you're using your own crew. We've got it under contract at $125,000.

Nick: So my all-in would be around $180,000 with an ARV of $235,000. That's decent margins. What about the neighborhood?

Rep: It's in a great pocket. The street has mostly owner-occupied homes, and there have been two flips on the same block in the last year — both sold within 30 days. One went for $228,000 and the other for $241,000.

Nick: Those are strong comps. Any issues with the title or anything like that?

Rep: Clean title, no liens, no code violations. Seller is cooperative and we can do a double close or assignment — whatever works better for you. Inspection period is 10 days.

Nick: What's the assignment fee?

Rep: We're asking $12,000 on this one. Given the margins and the area, I think it's very fair.

Nick: Yeah, that's reasonable. Can I drive by the property this afternoon?

Rep: Absolutely. I'll text you the lockbox code after this call. If you like what you see, I can have the assignment contract ready to sign tomorrow.

Nick: Sounds good. Let me take a look and I'll call you back tonight.

Rep: Perfect! Talk to you later, Nick.`;
  },
  (name, address) => {
    return `Rep: Hey ${name.split(" ")[0]}, it's Nick from Apex. Got a quick one for you — just locked up a deal at ${address} that I think fits your buy box. Three bed, one bath, about 1,100 square feet. Comps are showing ARV around $185,000.

${name.split(" ")[0]}: What's the purchase price?

Rep: We're at $95,000. Rehab estimate is $30,000 to $35,000 — mostly cosmetic. New paint, flooring, kitchen counters, bathroom refresh. Structure is solid though, foundation is good, roof has 5 years left.

${name.split(" ")[0]}: So all-in around $130,000 with an ARV of $185,000. What's the assignment fee?

Rep: $8,000. I know it's tight but the rehab is light and the area is hot right now. Last three sales on that street went pending in under 15 days.

${name.split(" ")[0]}: Is the seller motivated? Any timeline pressure?

Rep: Very motivated. They're relocating for work and need to close within 30 days. We can accommodate a quick close or a standard 30-day.

${name.split(" ")[0]}: Send me the property packet — comps, photos, everything. I'll review it tonight.

Rep: Will do. I'll email it over in the next hour. Let me know if you want to walk it this week.

${name.split(" ")[0]}: Yeah, maybe Thursday. I'll let you know after I see the numbers.

Rep: Sounds good. Talk soon!`;
  },
];

const warmCallTemplates: TranscriptBuilder[] = [
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Hi ${first}, this is Sarah from Apex Property Solutions. You filled out a form on our website about selling your property at ${address}. I wanted to follow up and learn a little more about your situation. Is now a good time?

${first}: Yeah, I have a few minutes. I was just browsing online and saw your ad.

Rep: Great, well I appreciate you reaching out. Can you tell me a little about the property and what's got you thinking about selling?

${first}: It's a 4-bedroom, 2-bath. We've been here about 15 years. The kids have moved out and it's just me and my wife now. It's more house than we need and the taxes keep going up.

Rep: I hear that a lot. Rising taxes on a house that's bigger than you need — that's a tough combination. Have you thought about where you'd like to go next?

${first}: We've been looking at some condos closer to downtown. Something smaller, easier to maintain.

Rep: That makes a lot of sense. And what kind of condition is the house in? Any major repairs needed?

${first}: It's in decent shape. We replaced the roof about 4 years ago. The kitchen could use updating and the master bath needs some work, but nothing critical.

Rep: That's helpful. What would be your ideal timeline if you were to sell?

${first}: Probably 2 to 3 months. We want to find a condo first before we commit to anything.

Rep: That's very reasonable. Here's what I'd suggest — let me pull some comparable sales in your area and give you an idea of what we could offer. Then if the number makes sense, we can work around your timeline. We're very flexible on closing dates. Would you be open to a quick walkthrough sometime this week?

${first}: Sure, how about Wednesday morning?

Rep: Wednesday morning works. Let's say 10 AM?

${first}: That's great. See you then.

Rep: Looking forward to it, ${first}. See you Wednesday at 10!`;
  },
];

const inboundTemplates: TranscriptBuilder[] = [
  (name, address) => {
    const first = name.split(" ")[0];
    return `Rep: Thank you for calling Apex Property Solutions, this is Marcus. How can I help you today?

${first}: Hi, yeah, I got a letter in the mail about selling my house? At ${address}?

Rep: Yes! Thanks for calling back, ${first}. We sent those letters to homeowners in your neighborhood because we're actively buying properties in the area. Are you thinking about selling?

${first}: Maybe. I've been going back and forth. My situation is kind of complicated.

Rep: I understand. There's no pressure at all. Can you tell me a little about what's going on?

${first}: Well, I inherited the house from my parents about three years ago. I've been renting it out but the tenants just moved out and the place needs a lot of work before I could rent it again. I'm tired of being a landlord honestly.

Rep: That's really common. Inherited properties can become a headache, especially when you're managing tenants from a distance. Is the house vacant now?

${first}: Yes, it's been empty for about a month.

Rep: And what kind of condition is it in? You mentioned it needs work?

${first}: The tenant wasn't great. There's some damage to the walls, carpet needs replacing throughout, one of the bathrooms has a leak. And the kitchen appliances are all from the early 2000s.

Rep: Got it. So cosmetic damage plus some plumbing work. That's very manageable from our perspective. We buy properties as-is, so you wouldn't need to fix any of that. What were you hoping to get for the property?

${first}: I honestly don't know. I haven't had it appraised or anything.

Rep: No problem. What I can do is pull some comparable sales in your area and come back to you with a fair offer. We typically close in two to three weeks and cover all closing costs. Would it be okay if I came by to take a quick look this week?

${first}: Yeah, that would be fine. I can meet you there.

Rep: How about Thursday at 11 AM?

${first}: That works. I'll be there.

Rep: Perfect, ${first}. I'll see you Thursday at ${address}. Thanks for calling in!`;
  },
];

const TEMPLATES: Record<string, TranscriptBuilder[]> = {
  cold_call: coldCallTemplates,
  warm_call: warmCallTemplates,
  inbound: inboundTemplates,
  follow_up: followUpTemplates,
  offer_call: offerCallTemplates,
  appointment_call: appointmentCallTemplates,
  dispo_call: dispoCallTemplates,
};

export function getRandomTranscript(callType: string, contactName: string, address: string): string {
  const templates = TEMPLATES[callType] ?? TEMPLATES.cold_call!;
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx]!(contactName, address);
}

export function getCallOutcome(callType: string): { callOutcome: string; classification: string } {
  const r = Math.random();
  switch (callType) {
    case "cold_call":
      return r < 0.4
        ? { callOutcome: "Follow-Up Scheduled", classification: "Interested" }
        : r < 0.7
          ? { callOutcome: "Not Interested", classification: "Not Interested" }
          : { callOutcome: "Voicemail", classification: "No Contact" };
    case "warm_call":
    case "inbound":
      return r < 0.6
        ? { callOutcome: "Appointment Set", classification: "Interested" }
        : { callOutcome: "Follow-Up Scheduled", classification: "Follow-Up Scheduled" };
    case "follow_up":
      return r < 0.5
        ? { callOutcome: "Follow-Up Scheduled", classification: "Follow-Up Scheduled" }
        : r < 0.8
          ? { callOutcome: "Appointment Set", classification: "Interested" }
          : { callOutcome: "Not Interested", classification: "Not Interested" };
    case "offer_call":
      return r < 0.3
        ? { callOutcome: "Offer Accepted", classification: "Offer Accepted" }
        : r < 0.7
          ? { callOutcome: "Offer Made", classification: "Considering" }
          : { callOutcome: "Offer Rejected", classification: "Offer Rejected" };
    case "appointment_call":
      return { callOutcome: "Appointment Confirmed", classification: "Interested" };
    case "dispo_call":
      return r < 0.5
        ? { callOutcome: "Buyer Interested", classification: "Interested" }
        : { callOutcome: "Sent Property Packet", classification: "Follow-Up Scheduled" };
    default:
      return { callOutcome: "Completed", classification: "pending" };
  }
}
