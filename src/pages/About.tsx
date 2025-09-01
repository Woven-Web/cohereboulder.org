import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import spiderWebImg from "@/assets/spider-web.png";
import gameStructureImg from "@/assets/game-structure.jpg";
import collaborationImg from "@/assets/collaboration.png";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-community">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6">
              Tell Me More
            </h1>
          </div>
        </section>

        {/* A Game You Say Section */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">
              A Game You Say?
            </h2>
            
            <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
              <p>
                During these 10 days, we'll be engaging in an immersive game.
              </p>
              
              <p>
                Rather than an escape from day-to-day life, this game invites you to lean deeper into it and try on new mindsets.
              </p>
              
              <p>
                As we go about our days, we will notice, celebrate, and create the nodes & threads of connection that weave our community more tightly and resiliently together.
              </p>
              
              <p>
                Take the spider's web as a metaphor for our community. We have many strong threads—anchored by gifted community activators—radiating outward into various aspects of life: food, movement, government, social justice. Kind of like the spider web woven with fewer cross-threads. This game is focused on weaving across our normal patterns to create a denser and more supportive community web.
              </p>
            </div>
            
            <div className="my-12">
              <img 
                src={spiderWebImg} 
                alt="Spider web metaphor for community connections" 
                className="w-full max-w-4xl mx-auto rounded-lg shadow-soft"
              />
            </div>
          </div>
        </section>

        {/* Choose Your Own Path Section */}
        <section className="py-20 bg-muted/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">
              Choose Your Own Path
            </h2>
            
            <div className="prose prose-lg max-w-none text-muted-foreground space-y-6 mb-8">
              <p>
                The structure of the 10-day container will include a Kick-off gathering, 2 convergence gatherings where we all come together to share and see what's been happening, and a closing party. In between, there will be a myriad of pre-planned and emergent events, encouraged collaboration time, and interactive gameplay that pervades all aspects of day-to-day life.
              </p>
            </div>
            
            <div className="my-12">
              <img 
                src={gameStructureImg} 
                alt="Game structure and timeline" 
                className="w-full max-w-4xl mx-auto rounded-lg shadow-soft"
              />
            </div>
            
            <div className="prose prose-lg max-w-none text-muted-foreground space-y-6 mb-8">
              <p>
                You are invited to engage in however much or little of the game's offerings throughout this period. Your participation should feel aligned with your enthusiasm and pre-existing commitments.
              </p>
            </div>
            
            <div className="text-center">
              <h3 className="text-2xl font-bold text-foreground mb-6">
                <Link to="/calendar" className="text-primary hover:underline">
                  View the Calendar here!
                </Link>
              </h3>
            </div>
          </div>
        </section>

        {/* Collaboration Image */}
        <section className="py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="my-8">
              <img 
                src={collaborationImg} 
                alt="Collaboration illustration" 
                className="w-full max-w-3xl mx-auto rounded-lg"
              />
            </div>
          </div>
        </section>

        {/* Where is this coming from Section */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-8">
              Where is this coming from?
            </h2>
            
            <div className="space-y-12">
              {/* CO]here emergence */}
              <div>
                <h3 className="text-xl font-bold text-foreground mb-4">
                  [CO]here is an emergence sprouting from a few heartful friends.
                </h3>
                <p className="text-lg text-muted-foreground">
                  Some of them are part of{" "}
                  <a 
                    href="https://wovenweb.org/" 
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Woven web
                  </a>
                  , a local org exploring how to encourage interconnectivity across Boulder.
                </p>
              </div>

              {/* Our Wider Web */}
              <div>
                <h3 className="text-xl font-bold text-foreground mb-4">
                  Our Wider Web
                </h3>
                <p className="text-lg text-muted-foreground mb-4">
                  [CO]here is also part of a wider emergence. We want to uplift our relationship to and the inspiration we draw from:
                </p>
                <ul className="space-y-2 text-lg text-muted-foreground">
                  <li>
                    •{" "}
                    <a 
                      href="https://ecoversities.org/" 
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      the ecoversities alliance
                    </a>
                  </li>
                  <li>
                    •{" "}
                    <a 
                      href="https://decolonialfutures.net/" 
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Decolonial Futures
                    </a>
                  </li>
                  <li>
                    •{" "}
                    <a 
                      href="https://www.emergencenetwork.org/" 
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ten (the emergence network)
                    </a>
                  </li>
                  <li>
                    •{" "}
                    <a 
                      href="https://secondrenaissance.net/" 
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Second Renaissance
                    </a>
                  </li>
                  <li>
                    •{" "}
                    <a 
                      href="https://www.ecogather.sterlingcollege.edu/" 
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      EcoGather
                    </a>
                  </li>
                  <li>
                    •{" "}
                    <a 
                      href="https://regeneratecascadia.org/" 
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Regenerate Cascadia
                    </a>
                  </li>
                </ul>
              </div>

              {/* Why now */}
              <div>
                <h3 className="text-xl font-bold text-foreground mb-4">
                  Why now?
                </h3>
                <p className="text-lg text-muted-foreground italic mb-4">
                  <a 
                    href="https://www.bayoakomolafe.net/post/the-times-are-urgent-lets-slow-down"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Times are urgent we must slow down.
                  </a>
                </p>
                <p className="text-lg text-muted-foreground">
                  This 'game' is meant to get to the heart of the resilience work we need to be doing — deepening into relationships and using our collective imagination to enact life in a way that works for all life.
                </p>
              </div>

              {/* Silly and serious */}
              <div>
                <h3 className="text-xl font-bold text-foreground mb-4">
                  Is this really meant to be <em>silly AND serious?</em>
                </h3>
                <p className="text-lg text-muted-foreground mb-4">
                  Gratitude. Grief. Glee. Giggles. Have you ever felt all of these at the same time?
                </p>
                <p className="text-lg text-muted-foreground">
                  We have. They are all appropriate responses to being alive; here, now. We want the full spectrum of emotions to feel welcome.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;